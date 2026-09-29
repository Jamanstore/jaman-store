const SUPABASE_URL="https://ilzeavaseohrbmprditr.supabase.co";
const {calculateDistributionQuote}=require("../../lib/distribution");
const SUPABASE_PUBLISHABLE_KEY="sb_publishable_3RYoXu_OVN6YtmLg1dolvA_mSugdq-O";

async function loadCatalog(){
  const response=await fetch(
    SUPABASE_URL+"/rest/v1/products?select=id,product_code,name,price_naira,sizes,categories(name)&active=eq.true",
    {headers:{apikey:SUPABASE_PUBLISHABLE_KEY,Authorization:"Bearer "+SUPABASE_PUBLISHABLE_KEY}}
  );
  if(!response.ok) throw new Error("Unable to load the current Jaman Store catalogue.");
  const rows=await response.json();
  return Object.fromEntries(rows.map(p=>[
    p.product_code,
    {dbId:p.id,name:p.name,price:Number(p.price_naira||0),sizes:Array.isArray(p.sizes)?p.sizes:[],category_name:(p.categories&&p.categories.name)||""}
  ]));
}

function send(res,status,payload){res.status(status).setHeader("Content-Type","application/json");res.end(JSON.stringify(payload));}
function validEmail(v){return typeof v==="string"&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());}
function siteUrl(req){return (process.env.SITE_URL||((req.headers["x-forwarded-proto"]||"https")+"://"+req.headers.host)).replace(/\/$/,"");}
const rateWindow=new Map();
function clientIp(req){const v=req.headers["x-forwarded-for"]||req.headers["x-real-ip"]||"unknown";return String(v).split(",")[0].trim().slice(0,80)||"unknown";}
function rateLimited(req){const now=Date.now(),key=clientIp(req),entry=rateWindow.get(key);if(!entry||now-entry.start>600000){rateWindow.set(key,{start:now,count:1});return false;}entry.count++;return entry.count>20;}
async function calculateDelivery(customer,items,CATALOG){
  const normalized=items.map(item=>{const p=CATALOG[item.id];return {name:p?.name||"",category:(p?.category_name||""),qty:item.qty};});
  const city=String(customer.city||"").trim();
  const quote=calculateDistributionQuote(city,normalized);
  if(quote.status==="quote_required")throw new Error("This order requires a custom distribution quotation. Please contact Jaman Store on WhatsApp before payment.");
  return quote;
}
;