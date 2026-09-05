import "server-only";

/**
 * Domain event bus — the P0–P5 answer per docs/architecture.md §5.5 and §7.1:
 * "an in-process emitter, not a message queue, since there's exactly one
 * process and zero external subscribers until GL exists." A future P6+
 * double-entry GL module subscribes to `invoice.posted` and builds ledger
 * entries from it, without this file or invoicing.ts ever being touched
 * again — that's the entire point of emitting the event now, before there
 * is anyone listening.
 *
 * Deliberately NOT Node's EventEmitter: no need for its error-throwing
 * "unhandled 'error' event" behaviour or its listener-count warnings for
 * what is, today, a two-line pub/sub with at most a handful of listeners.
 *
 * Revisit per §7.1 if a second real in-process subscriber shows up before
 * P6 — two consumers is usually the point an in-process emitter starts
 * being the wrong tool.
 */

export interface InvoicePostedEvent {
  type: "invoice.posted";
  tenantId: string;
  invoiceId: string;
  companyId: string;
  partnerId: string;
  total: number;
  currency: string;
  postedAt: string;
}

export interface PaymentRecordedEvent {
  type: "payment.recorded";
  tenantId: string;
  paymentId: string;
  companyId: string;
  partnerId: string;
  amount: number;
  currency: string;
}

export interface CreditNoteIssuedEvent {
  type: "creditnote.issued";
  tenantId: string;
  creditNoteId: string;
  invoiceId: string;
  total: number;
}

export interface BillPostedEvent {
  type: "bill.posted";
  tenantId: string;
  billId: string;
  companyId: string;
  partnerId: string;
  total: number;
  currency: string;
  postedAt: string;
}

export interface BillPaymentRecordedEvent {
  type: "billpayment.recorded";
  tenantId: string;
  billPaymentId: string;
  companyId: string;
  partnerId: string;
  amount: number;
  currency: string;
}

/**
 * Emitted by recordMove() (src/server/inventory/stock.ts) for any stock
 * move that crosses the company's ownership boundary -- exactly the moves
 * that already get a StockValuationLayer, never a plain internal transfer.
 * This is the P2-stock-moves-don't-emit-events gap every P6+ module's own
 * scope notes named as future work, closed here: the GL subscriber uses it
 * to post Dr Cost of Goods Sold / Cr Inventory Asset when a sale ships
 * (moveType "delivery"). Every other moveType is deliberately ignored by
 * that handler today -- see gl-subscriber.ts's own comment on why.
 */
export interface StockValuedEvent {
  type: "stock.valued";
  tenantId: string;
  moveId: string;
  moveType: "receipt" | "delivery" | "transfer" | "adjustment" | "consumption" | "production";
  productId: string;
  /** The internal (owned-stock) location on this move's owning side -- always has a warehouse, used to resolve which company this belongs to. */
  internalLocationId: string;
  /** Signed: positive value entering the company's books, negative leaving. Matches StockValuationLayer.value exactly. */
  value: number;
  quantity: number;
  movedAt: string;
}

export type DomainEvent =
  | InvoicePostedEvent
  | PaymentRecordedEvent
  | CreditNoteIssuedEvent
  | BillPostedEvent
  | BillPaymentRecordedEvent
  | StockValuedEvent;

type Listener<E extends DomainEvent> = (event: E) => void | Promise<void>;

const listeners = new Map<DomainEvent["type"], Set<Listener<DomainEvent>>>();

export function on<T extends DomainEvent["type"]>(
  type: T,
  listener: Listener<Extract<DomainEvent, { type: T }>>
): void {
  const set = listeners.get(type) ?? new Set();
  set.add(listener as Listener<DomainEvent>);
  listeners.set(type, set);
}

/**
 * Fire-and-forget by design: emitting an event must never fail or slow down
 * the transaction that just committed the document it describes. A listener
 * that throws is logged and swallowed, not propagated -- posting an invoice
 * must succeed even if a future subscriber (e.g. GL posting) has a bug.
 */
export function emit(event: DomainEvent): void {
  const set = listeners.get(event.type);
  if (!set || set.size === 0) return;
  for (const listener of set) {
    try {
      void listener(event);
    } catch (err) {
      console.error(`[domain-event] listener for "${event.type}" threw`, err);
    }
  }
}
