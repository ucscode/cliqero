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

## Migration status

The public storefront/authentication surfaces, normal-user dashboard, and
operator shell now compose the primitives directly. Dashboard navigation uses
the shared Sidebar/Sheet composition; operator feature screens import shadcn
primitives directly rather than the temporary compatibility barrel. `Money` is
a Cliqero-specific formatting component at `components/money.tsx`, never a
generic UI primitive. Remaining global CSS is limited to document tokens,
feature-specific layouts, and the specialized referral graph; Milestone 5 will
perform the final dead-selector audit.
