# Frontend component system

Tailwind CSS and shadcn/ui (Radix primitives) are the canonical generic UI
stack. Feature components compose the primitives in `apps/web/src/components/ui`
and keep data orchestration and Cliqero-specific interactions in
`apps/web/src/components`.

Do not create new generic controls or large semantic CSS systems. Use the
standard Button, Input, Card, Badge, Dialog, DropdownMenu, Tabs, Sheet, Table,
Alert, Skeleton, Label, and related primitives. Tailwind utilities and
variants provide layout and states; global CSS is reserved for document tokens,
third-party integration styles, and genuinely specialized visuals.

The referral hierarchy remains a specialized `@xyflow/react` + Dagre
visualization. All shared controls must remain keyboard accessible, labelled,
focus-visible, and usable at mobile widths without page-level horizontal
overflow.
