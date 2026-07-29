# Official Documentation Fees Design

## Objective

Ensure that every Medical Certificate (MC), prescription slip, and referral
letter issued to a patient creates a configurable charge in the same visit's
billing. The feature applies to both cash and panel patients.

## Document types and initial prices

The clinic will maintain one price for each supported document type:

| Document type | Initial price |
| --- | ---: |
| Medical Certificate (MC) | RM15.00 |
| Prescription slip | RM15.00 |
| Referral letter | RM15.00 |

Prices must be zero or greater and use two-decimal currency precision.

## Price management

A Document Fees section will be available from the clinic's document-template
settings. It will show the current price for each supported document type and
identify who may edit it.

MC pricing may be changed by:

- operations staff;
- resident doctors;
- admin users; and
- doctor-admin users.

Locum doctors cannot change MC pricing.

Prescription-slip and referral-letter pricing may be changed only by admin and
doctor-admin users.

Authorization will be enforced in the database as well as in the interface.
Hiding an editing control is not sufficient protection.

## Billing behavior

When a supported consultation document is first issued, the system will create
one linked consultation billing item using the price that is configured at the
time of issuance.

The customer-facing description on receipts and panel claims will be:

> Official Documentation Fees

The billing record will also retain the document ID and document type as
internal metadata. This permits auditing and correct reversal without exposing
internal labels on the patient-facing financial documents.

The price will be snapshotted on the billing item. Later changes to the default
price will affect only documents issued after the change; they will not rewrite
historical bills.

The fee applies equally to cash and panel visits. Panel-claim totals must include
the fee through the existing consultation-item calculation path.

## Idempotency and reversals

Each consultation document may have at most one active documentation-fee billing
item. A database uniqueness rule will protect this invariant.

- Reprinting a document does not create another fee.
- Editing an issued document does not create another fee.
- Voiding or deleting an issued document voids its linked fee.
- A failed charge creation prevents the document from being saved.
- A failed fee reversal prevents the document from being voided.

Issuance and charging, and voiding and reversal, will each be performed as one
database transaction so the document and its financial record cannot diverge.

## Completed and paid bills

If a supported document is issued after its visit has already been completed
and paid, the existing payment remains unchanged. The new documentation fee is
added through the completed-bill correction mechanism and becomes a new
outstanding amount.

The visit remains clinically completed. Financial reporting, the bill,
outstanding self-pay or panel balance, receipt, and panel claim must all use the
corrected item total.

If that late-issued document is subsequently voided, only its linked
documentation fee is reversed. Existing payments and unrelated billing items
remain unchanged.

## Data model

The database will add:

1. A document-fee configuration table keyed by document type, seeded with the
   three RM15.00 defaults.
2. A link from each documentation-fee consultation item to its source
   consultation document, with internal document-type metadata.
3. Guarded database functions for:
   - updating document prices according to role;
   - issuing a document and its fee atomically; and
   - voiding a document and its fee atomically.
4. Row-level security and explicit grants following the existing clinic-role
   model.

Existing issued documents will not be charged retrospectively.

## Interface changes

The Document Templates settings page will display the three prices and allow
authorized users to edit only the fields permitted for their role.

The consultation and dispensary document lists will show whether a supported
document has an active RM charge. Issuing and voiding will continue to use the
current document workflow, with clear success or failure messages.

Receipts and panel claims will continue using the existing billing rendering,
because the charge is represented as a normal consultation item with the
official description.

## Error handling

- Invalid or negative prices are rejected.
- Unsupported document types do not create a documentation fee.
- Unauthorized price changes return a clear permission error.
- Duplicate issuance attempts return the existing linked fee instead of adding
  a second charge.
- Financial mutations on completed bills use the established guarded correction
  path and its audit trail.

## Testing and acceptance criteria

Automated tests will verify:

1. Each supported document issued before checkout creates exactly one fee at
   the configured price.
2. Cash receipts and panel claims display `Official Documentation Fees`.
3. Reprinting and editing do not duplicate the charge.
4. Voiding removes only the linked documentation fee.
5. A post-payment document creates a new outstanding amount while preserving
   the original payment.
6. Changing a default price does not alter historical charges.
7. MC price permissions include operations staff and resident doctors but
   exclude locums.
8. Prescription and referral price changes are restricted to admin and
   doctor-admin users.
9. Unsupported document types remain free and unchanged.
10. Concurrent duplicate requests cannot create two active fees for one
    document.

Deployment verification will include authenticated database checks for each
authorized and unauthorized role, one cash billing scenario, one panel claim
scenario, and one completed-bill scenario.
