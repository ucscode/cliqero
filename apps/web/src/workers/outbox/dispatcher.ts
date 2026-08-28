import type { ClaimedOutboxEvent,PostgresOutbox } from "@/infrastructure/postgres/outbox";

export interface OutboxEventHandler {
  readonly eventNames:readonly string[];
  handle(event:ClaimedOutboxEvent):Promise<void>;
}
export interface WorkerLogger {
  info(fields:Record<string,unknown>,message:string):void;
  error(fields:Record<string,unknown>,message:string):void;
}
export class JsonConsoleLogger implements WorkerLogger {
  info(fields:Record<string,unknown>,message:string){console.log(JSON.stringify({level:"info",message,...fields,timestamp:new Date().toISOString()}));}
  error(fields:Record<string,unknown>,message:string){console.error(JSON.stringify({level:"error",message,...fields,timestamp:new Date().toISOString()}));}
}
export class OutboxHandlerRegistry {
  private readonly handlers=new Map<string,OutboxEventHandler>();
  register(handler:OutboxEventHandler):this {
    for(const name of handler.eventNames){if(this.handlers.has(name))throw new Error(`Outbox handler already registered: ${name}`);this.handlers.set(name,handler);} return this;
  }
  get(eventName:string):OutboxEventHandler {const handler=this.handlers.get(eventName);if(!handler)throw new Error(`No outbox handler registered: ${eventName}`);return handler;}
}

export interface OutboxDispatcherOptions {batchSize:number;pollMilliseconds:number;staleAfterMilliseconds:number;}
const defaults:OutboxDispatcherOptions={batchSize:20,pollMilliseconds:1000,staleAfterMilliseconds:300_000};

export class OutboxDispatcher {
  private readonly options:OutboxDispatcherOptions;
  constructor(private readonly workerId:string,private readonly outbox:PostgresOutbox,private readonly handlers:OutboxHandlerRegistry,
    private readonly logger:WorkerLogger=new JsonConsoleLogger(),options:Partial<OutboxDispatcherOptions>={}) {this.options={...defaults,...options};}

  async runOnce():Promise<number> {
    const recovered=await this.outbox.recoverAbandoned(this.options.staleAfterMilliseconds);
    if(recovered)this.logger.info({worker_id:this.workerId,recovered},"outbox.recovered");
    const events=await this.outbox.claim(this.workerId,this.options.batchSize);
    await Promise.all(events.map(event=>this.dispatch(event)));
    return events.length;
  }

  async run(signal:AbortSignal):Promise<void> {
    this.logger.info({worker_id:this.workerId},"outbox.worker.started");
    while(!signal.aborted){
      try { const processed=await this.runOnce(); if(processed===0)await wait(this.options.pollMilliseconds,signal); }
      catch(error){this.logger.error({worker_id:this.workerId,error:errorMessage(error)},"outbox.poll.failed");await wait(this.options.pollMilliseconds,signal);}
    }
    this.logger.info({worker_id:this.workerId},"outbox.worker.stopped");
  }

  private async dispatch(event:ClaimedOutboxEvent):Promise<void> {
    const fields={worker_id:this.workerId,event_id:event.id,event_name:event.name,correlation_id:event.correlationId,attempt:event.attemptCount};
    try { await this.handlers.get(event.name).handle(event); await this.outbox.markPublished(event.id,this.workerId); this.logger.info(fields,"outbox.event.published"); }
    catch(error){const message=errorMessage(error);await this.outbox.markFailed(event.id,this.workerId,message);this.logger.error({...fields,error:message},"outbox.event.failed");}
  }
}

function errorMessage(error:unknown):string{return error instanceof Error?error.message:String(error);}
function wait(milliseconds:number,signal:AbortSignal):Promise<void>{return new Promise(resolve=>{if(signal.aborted)return resolve();
  const timeout=setTimeout(done,milliseconds);function done(){clearTimeout(timeout);signal.removeEventListener("abort",done);resolve();}signal.addEventListener("abort",done,{once:true});});}

