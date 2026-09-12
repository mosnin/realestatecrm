import {z} from 'zod';
export const EDITABLE_RECORD_FIELDS={contact:['name','email','phone','leadType'],deal:['title','value','closeDate'],property:['address','city','listPrice','beds','baths']} as const;
export const EDITABLE_RECORD_DESCRIPTION={contact:'Name, email, phone, and relationship type.',deal:'Title, value, and expected close date. Stage and closing status stay protected.',property:'Address, city, list price, bedrooms, and bathrooms. Listing status stays protected.'};
export const recordEditChanges=z.object({
  name:z.string().trim().min(1).max(200).optional(),email:z.string().email().max(254).nullable().optional(),phone:z.string().max(40).nullable().optional(),leadType:z.enum(['buyer','seller','rental']).optional(),
  title:z.string().trim().min(1).max(200).optional(),value:z.number().nonnegative().max(1_000_000_000).nullable().optional(),closeDate:z.string().datetime({offset:true}).nullable().optional(),
  address:z.string().trim().min(1).max(500).optional(),city:z.string().max(200).nullable().optional(),listPrice:z.number().nonnegative().max(1_000_000_000).nullable().optional(),beds:z.number().nonnegative().max(999.9).nullable().optional(),baths:z.number().nonnegative().max(999.9).nullable().optional(),
}).strict().refine(value=>Object.keys(value).length>0,'Choose a field to edit');
export const recordEditRequest=z.object({grantId:z.string().uuid(),source:z.enum(['personal','brokerage']),requestId:z.string().uuid(),revision:z.string().datetime({offset:true}),changes:recordEditChanges}).strict();

