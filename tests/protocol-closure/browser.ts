import { churn } from "./churn.ts";
import { staged } from "./staged.ts";
import { browserStore } from "../segmented-recovery/store-browser.ts";
import { check } from "../segmented-recovery/wire.ts";
declare global {interface Window {closureProbe:(name:string)=>ReturnType<typeof churn>}}
window.closureProbe=async(name)=>{
  check(name==="offline-membership-churn"||name==="selected-profile-staged-state","unknown case");
  const store="noseq-closure-"+crypto.randomUUID();
  return (name==="offline-membership-churn"?churn:staged)(await browserStore(store),()=>browserStore(store),name);
};
