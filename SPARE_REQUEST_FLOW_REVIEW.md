# Spare request and replenishment review

## Repair spare supply
Technician diagnosis / Job Card → Workshop Manager review → Store availability check → Procurement for unavailable parts → existing Accounts/PI and supplier ordering steps → Store receives stock / confirms Parts Ready → technician continues repair and testing. Installation confirmation is a separate repair record; inventory availability alone is not proof of installation.

The existing breakdown workflow enforces department permissions and separates BELM-owned repairs from customer-owned workshop repairs. No ownership permissions were changed by this release.

## Inventory replenishment
The technician inventory-alert endpoint creates a zero-stock alert for an assigned machine. These records have requested_by_id but no service request or customer procurement source. They are now identified as STOCK_ALERT in read responses, without rewriting historic records.

Store reviews the part and shortage → sends it to Procurement when necessary → supplier order → Store receives enough stock → alert can close. The alert is no longer offered as a customer Proforma source. Existing commercial documents are preserved. Ordinary customer/service supply requests retain their quotation actions.

Low-stock count, selection, inventory analysis and export recommendations now use each spare's recorded reorder threshold. Suggested quantities target twice that threshold, apply only to low-stock items, and require review before purchasing. They do not place an order.

## Technician recommendations
Recommend Spare is a separate technician-to-customer service recommendation requiring customer confirmation. It is not an automatic store purchase or proof that a spare has been issued. This flow and its customer authorization checks remain unchanged.

## Safeguards and presentation
- Compact cards show source, stage, machine/customer and requested/current/shortage quantities. Secondary details are collapsible.
- Receive stock is available for partial shortages, not just zero stock.
- Closing requires stock to cover the request quantity.
- Closed requests reject repeat state changes; repeated Purchase Required does not resend notices.
- An ordered spare cannot be silently replaced through Select Spare.
- New zero-stock alerts serialize their part lookup before duplicate checking.
- Stock-alert closure notifications no longer claim customer delivery or repair completion.
- No stock quantities, historical requests, invoices or financial records are altered during deployment. No schema migration is required.
