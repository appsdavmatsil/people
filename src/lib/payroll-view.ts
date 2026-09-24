export const payrollViewKey = "people.payroll-view";
export const payrollViewEvent = "people-payroll-view";

export type PayrollView = "current" | "promoted";

let clientRaw: string | null = null;
let clientSnapshot: PayrollView | null = null;

export function getServerPayrollView(): PayrollView {
  return "current";
}

export function getPayrollViewSnapshot(): PayrollView {
  if (typeof window === "undefined") {
    return getServerPayrollView();
  }

  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(payrollViewKey);
  } catch {
    raw = null;
  }

  if (clientSnapshot && raw === clientRaw) {
    return clientSnapshot;
  }

  clientRaw = raw;
  clientSnapshot = raw === "promoted" ? "promoted" : "current";
  return clientSnapshot;
}

export function savePayrollView(view: PayrollView) {
  window.localStorage.setItem(payrollViewKey, view);
  clientRaw = view;
  clientSnapshot = view;
  window.dispatchEvent(new Event(payrollViewEvent));
  return view;
}

export function subscribePayrollView(onStoreChange: () => void) {
  function onStorage(event: StorageEvent) {
    if (event.key !== payrollViewKey) {
      return;
    }

    onStoreChange();
  }

  window.addEventListener("storage", onStorage);
  window.addEventListener(payrollViewEvent, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(payrollViewEvent, onStoreChange);
  };
}
