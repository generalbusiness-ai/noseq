import { test, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
for(const name of ["offline-membership-churn","selected-profile-staged-state"])
  test("closure.browser."+name,async({page,browser})=>{
    await page.goto("/");
    await expect.poll(()=>page.evaluate(()=>typeof window.closureProbe)).toBe("function");
    const result=await page.evaluate(name=>window.closureProbe(name),name);
    await writeFile(join(process.env.NOSEQ_CLOSURE_RUN!,"browser-"+name+".json"),JSON.stringify({...result,
      browserVersion:browser.version(),...await page.evaluate(()=>({secure:isSecureContext,userAgent:navigator.userAgent}))},null,2),{flag:"wx"});
  });
