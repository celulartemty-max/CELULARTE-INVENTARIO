export type MovementStatus = "DRAFT" | "CLOSED" | "PENDING_POS" | "POS_REGISTERED" | "REOPENED" | "REOPENED_REQUIRES_POS_REVIEW" | "POS_CORRECTION_PENDING" | "POS_RECONCILED" | "CANCELLED";
export const isClosedState=(status:MovementStatus)=>status!=="DRAFT";
export const canEditReception=(role:string,status:MovementStatus)=>status!=="CANCELLED"&&(status==="DRAFT"||role==="MASTER");
export const canRegisterPos=(status:MovementStatus,registeredAt:unknown)=>status!=="DRAFT"&&status!=="CANCELLED"&&!registeredAt;
export const canRegisterPosCorrection=(status:MovementStatus,registeredAt:unknown)=>status==="POS_CORRECTION_PENDING"&&Boolean(registeredAt);
export function assertPositiveQuantity(quantity:number){if(!Number.isInteger(quantity)||quantity<=0)throw new Error("INVALID_QUANTITY")}
