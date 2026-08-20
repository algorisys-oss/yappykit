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

  export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';
  export type ButtonVariant =
    | 'default'
    | 'secondary'
    | 'destructive'
    | 'outline'
    | 'ghost'
    | 'link';
  export type ButtonProps<T extends ValidComponent = 'button'> = JSX.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: ButtonVariant;
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
