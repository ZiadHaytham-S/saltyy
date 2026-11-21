import { SalltyLoader } from './sallty-loader';

export function PageLoader() {
  return (
    <div
      className="flex min-h-[55vh] w-full items-center justify-center text-primary"
      aria-busy="true"
      data-testid="page-loader"
    >
      <SalltyLoader className="size-16" label="جارٍ التحميل / Loading" />
    </div>
  );
}
