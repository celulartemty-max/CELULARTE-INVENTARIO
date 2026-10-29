/** Pending identification or physical count at the receiving branch, not POS work. */
export const receiptPendingSql=`s.status='DRAFT' AND (
  s.total_boxes > (SELECT count(*) FROM receiving_cartons b WHERE b.session_id=s.id)
    + COALESCE((SELECT sum(f.carton_count) FROM receiving_foreign_cartons f WHERE f.session_id=s.id AND f.voided_at IS NULL),0)
  OR EXISTS(SELECT 1 FROM receiving_cartons b JOIN receiving_orders o ON o.id=b.order_id
    WHERE b.session_id=s.id AND NOT o.is_foreign AND o.destination_branch_id=s.branch_id AND b.counted_at IS NULL)
)`;
