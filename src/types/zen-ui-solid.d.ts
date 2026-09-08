/**
 * Thin ambient types for the vendored zen-ui Solid binding.
 *
 * The RUNTIME is the real library (Vite aliases '@algorisys/zen-ui-solid' to
 * vendor/zen-ui/packages/solid/dist/index.js). We decouple the TYPES here on
 * purpose: the binding's real .d.ts re-export chain reaches into
 * @algorisys/zen-ui-core's raw .ts source, which would drag third-party code
 * into our strict typecheck. This declares only the surface YappyKit uses.
 *
 * Mirrors packages/solid/dist/components/**.d.ts in the submodule — keep in sync
 * when we adopt more zen components.
 */
declare module '@algorisys/zen-ui-solid' {
  import type { JSX, ValidComponent } from 'solid-js';

  /**
   * These MUST match `buttonVariants` in
   * vendor/zen-ui/packages/core/src/variants.ts, because nothing checks that
   * they do. They previously carried shadcn's older vocabulary ('default',
   * 'secondary', 'destructive'), which the vendored library has not used for
   * some time: cva emits no classes at all for a variant value it does not
   * know, so `variant="secondary"` typechecked and then rendered an unstyled
   * button, black on the dark theme at a contrast of 1.18:1. A wrong name here
   * is invisible until someone looks at the page.
   *
   * Weight is `variant`; hue is `color`. They are separate props.
   */
  export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  export type ButtonVariant = 'solid' | 'outline' | 'soft' | 'ghost' | 'link';
  export type ButtonColor = 'primary' | 'neutral' | 'info' | 'success' | 'warning' | 'error';
  export type ButtonShape = 'default' | 'square' | 'circle' | 'block';
  export type ButtonProps<T extends ValidComponent = 'button'> = JSX.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: ButtonVariant;
    color?: ButtonColor;
    shape?: ButtonShape;
    size?: ButtonSize;
    loading?: boolean;
    iconLeft?: JSX.Element;
    iconRight?: JSX.Element;
    class?: string;
    children?: JSX.Element;
    /** Polymorphic escape hatch (Solid's asChild): e.g. as={A} for a router link. */
    as?: T;
    href?: string;
  };
  export const Button: <T extends ValidComponent = 'button'>(props: ButtonProps<T>) => JSX.Element;

  export type SwitchSize = 'sm' | 'md' | 'lg';
  export type SwitchProps = Omit<JSX.HTMLAttributes<HTMLDivElement>, 'class' | 'onChange'> & {
    size?: SwitchSize;
    class?: string;
    id?: string;
    checked?: boolean;
    defaultChecked?: boolean;
    onChange?: (checked: boolean) => void;
    disabled?: boolean;
    required?: boolean;
    name?: string;
    value?: string;
    label?: JSX.Element;
  };
  export const Switch: (props: SwitchProps) => JSX.Element;

  export type RadioSize = 'sm' | 'md' | 'lg';
  export type RadioGroupProps = {
    value?: string;
    defaultValue?: string;
    onChange?: (value: string) => void;
    disabled?: boolean;
    name?: string;
    class?: string;
    children?: JSX.Element;
  };
  export const RadioGroup: (props: RadioGroupProps) => JSX.Element;
  export type RadioGroupItemProps = {
    value: string;
    disabled?: boolean;
    class?: string;
    children?: JSX.Element;
  };
  export const RadioGroupItem: (props: RadioGroupItemProps) => JSX.Element;

  // Minimal shape of TanStack's ColumnDef — only the fields YappyKit passes.
  // The real DataTable resolves @tanstack/solid-table at runtime from the
  // vendored binding; we avoid importing its (heavy, generic) types here.
  export interface ColumnDef<TData> {
    id?: string;
    accessorKey?: keyof TData & string;
    header?: string | ((ctx: unknown) => JSX.Element);
    cell?: (ctx: { row: { original: TData }; getValue: () => unknown }) => JSX.Element;
    enableSorting?: boolean;
    size?: number;
  }
  export interface DataTableProps<TData> {
    data: TData[];
    columns: ColumnDef<TData>[];
    enableSorting?: boolean;
    enablePagination?: boolean;
    enableColumnFilters?: boolean;
    enableGlobalFilter?: boolean;
    enableVirtualization?: boolean;
    globalFilterPlaceholder?: string;
    rowClassName?: (row: { original: TData }) => string | undefined;
    emptyMessage?: string;
    pageSize?: number;
    maxBodyHeight?: number;
    stickyHeader?: boolean;
    class?: string;
  }
  export function DataTable<TData>(props: DataTableProps<TData>): JSX.Element;
}

declare const __APP_VERSION__: string;
declare const __APP_COMMIT__: string;
