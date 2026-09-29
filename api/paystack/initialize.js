const SUPABASE_URL="https://ilzeavaseohrbmprditr.supabase.co";
const SUPABASE_PUBLISHABLE_KEY="sb_publishable_3RYoXu_OVN6YtmLg1dolvA_mSugdq-O";
const {calculateDistributionQuote}=require("../../lib/distribution");

async function loadCatalog(){
  const response=await fetch(SUPABASE_URL+"/rest/v1/products?select=id,product_code,name,price_naira,sizes,categories(name)&active=eq.true",{headers:{apikey:SUPABASE_PUBLISHABLE_KEY,Authorization:"Bearer "+SUPABASE_PUBLISHABLE_KEY}});
  if(!response.ok)throw new Error("Unable to load the current Jaman Store catalogue.");
  const rows=await response.json();
  return Object.fromEntries(rows.map(p=>[p.product_code,{dbId:p.id,name:p.name,price:Number(p.price_naira||0),sizes:Array.isArray(p.sizes)?p.sizes:[],category_name:(p.categories&&p.categories.name)||""}]));
}
function send(res,status,payload){res.status(status).setHeader("Content-Type","application/json");res.end(JSON.stringify(payload));}
function validEmail(v){return typeof v==="string"&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());}
function siteUrl(req){return(process.env.SITE_URL||((req.headers["x-forwarded-proto"]||"https")+"://"+req.headers.host)).replace(/\/$/,"");}
const rateWindow=new Map();
function clientIp(req){const v=req.headers["x-forwarded-for"]||req.headers["x-real-ip"]||"unknown";return String(v).split(",")[0].trim().slice(0,80)||"unknown";}
function rateLimited(req){const now=Date.now(),key=clientIp(req),entry=rateWindow.get(key);if(!entry||now-entry.start>600000){rateWindow.set(key,{start:now,count:1});return false;}entry.count++;return entry.count>20;}

module.exports=async(req,res)=>{
 if(req.method!=="POST")return send(res,405,{status:false,message:"Method not allowed"});
 if(rateLimited(req))return send(res,429,{status:false,message:"Too many checkout attempts. Please wait a few minutes and try again."});
 if(!process.env.PAYSTACK_SECRET_KEY)return send(res,503,{status:false,message:"Paystack is not configured. Add PAYSTACK_SECRET_KEY in the hosting environment."});
 try{
  const body=typeof req.body==="string"?JSON.parse(req.body):(req.body||{}),customer=body.customer||{},items=Array.isArray(body.items)?body.items:[];
  if(!validEmail(customer.email))return send(res,400,{status:false,message:"A valid customer email is required."});
  if(!customer.name||!customer.phone||!customer.state||!customer.city)return send(res,400,{status:false,message:"Complete customer and pickup city details are required."});
  if(!items.length)return send(res,400,{status:false,message:"Your cart is empty."});
  if(items.length>50)return send(res,400,{status:false,message:"Too many items in one checkout."});

  const CATALOG=await loadCatalog();
  const variantResponse=await fetch(SUPABASE_URL+"/rest/v1/product_variants?select=product_id,label,price_naira&active=eq.true",{headers:{apikey:SUPABASE_PUBLISHABLE_KEY,Authorization:"Bearer "+SUPABASE_PUBLISHABLE_KEY}});
  const variants=variantResponse.ok?await variantResponse.json():[];
  const VARIANTS=new Map(variants.map(v=>[v.product_id+"|"+v.label,Number(v.price_naira||0)]));

  const normalized=[];
  let subtotal=0;
  for(const item of items){
   const p=CATALOG[item.id],qty=Math.floor(Number(item.qty));
   if(!p||p.price<=0||!Number.isInteger(qty)||qty<1||qty>50)return send(res,400,{status:false,message:"Invalid cart item."});
   const size=String(item.size||"").replace(/[″”]/g,'"').trim();
   const normalizedSizes=p.sizes.map(s=>String(s).replace(/[″”]/g,'"').trim());
   if(!normalizedSizes.includes(size))return send(res,400,{status:false,message:"Invalid size for "+p.name+"."});
   const variantPrice=VARIANTS.get(p.dbId+"|"+size);
   const unitPrice=variantPrice>0?variantPrice:p.price;
   subtotal+=unitPrice*qty;
   normalized.push({id:item.id,name:p.name,size,qty,unit_price_naira:unitPrice,category:p.category_name});
  }

  const distribution=calculateDistributionQuote(String(customer.city).trim(),normalized);
  if(distribution.status==="quote_required")return send(res,409,{status:false,quote_required:true,message:"This order requires a custom distribution quotation. Please contact Jaman Store on WhatsApp before payment."});
  const deliveryFee=distribution.fee;
  const grandTotal=subtotal+deliveryFee;
  const amount=Math.round(grandTotal*100);
  const reference="JAMAN-"+Date.now()+"-"+Math.random().toString(36).slice(2,10).toUpperCase();
  const callback=siteUrl(req)+"/payment-success.html";

  const customerMeta={name:String(customer.name).trim(),email:customer.email.trim(),phone:String(customer.phone).trim(),state:String(customer.state).trim(),city:distribution.city,address:String(customer.address||"").trim(),delivery_location_id:null,delivery_location_name:"Jaman Store "+distribution.city+" Collection Network",delivery_location_address:"Exact collection point will be assigned and communicated after order confirmation."};
  const itemSummary=normalized.map(i=>`${i.name} | ${i.size} | Qty ${i.qty}`).join("; ");
  const metadata={
   order_reference:reference,order_total_kobo:amount,subtotal_naira:subtotal,delivery_fee_naira:deliveryFee,
   delivery_method:"pickup",delivery_location_id:null,delivery_location_name:customerMeta.delivery_location_name,delivery_location_address:customerMeta.delivery_location_address,
   distribution_category:distribution.category,fulfillment_factory:distribution.factory,distribution_city:distribution.city,distribution_min_days:distribution.minDays,distribution_max_days:distribution.maxDays,
   cancel_action:siteUrl(req)+"/",customer:customerMeta,
   items:normalized.map(i=>({...i,product_code:i.id})),
   custom_fields:[
    {display_name:"Store",variable_name:"store",value:"Jaman Store"},
    {display_name:"Business",variable_name:"business",value:"Jaman Business Company"},
    {display_name:"Brand",variable_name:"brand",value:"VITAFOAM"},
    {display_name:"Order Reference",variable_name:"order_reference",value:reference},
    {display_name:"Customer",variable_name:"customer",value:customerMeta.name},
    {display_name:"Products",variable_name:"products",value:itemSummary},
    {display_name:"Collection & Distribution Fee",variable_name:"distribution_fee",value:"₦"+deliveryFee.toLocaleString("en-NG")},
    {display_name:"Collection City",variable_name:"collection_city",value:distribution.city},
    {display_name:"Fulfillment Factory",variable_name:"fulfillment_factory",value:distribution.factory},
    {display_name:"Distribution Category",variable_name:"distribution_category",value:distribution.category},
    {display_name:"Estimated Transit",variable_name:"estimated_transit",value:distribution.minDays+"–"+distribution.maxDays+" days"}
   ]
  };

  const response=await fetch("https://api.paystack.co/transaction/initialize",{method:"POST",headers:{"Authorization":"Bearer "+process.env.PAYSTACK_SECRET_KEY,"Content-Type":"application/json"},body:JSON.stringify({email:customer.email.trim(),amount,currency:"NGN",reference,callback_url:callback,metadata})});
  const data=await response.json();
  if(!response.ok||!data.status)return send(res,502,{status:false,message:data.message||"Paystack could not initialize the transaction."});
  return send(res,200,{status:true,authorization_url:data.data.authorization_url,access_code:data.data.access_code,reference:data.data.reference,distribution:{fee:deliveryFee,city:distribution.city,factory:distribution.factory,category:distribution.category,minDays:distribution.minDays,maxDays:distribution.maxDays}});
 }catch(err){console.error("Paystack initialize error",err);return send(res,400,{status:false,message:err&&err.message?err.message:"Unable to start payment. Please try again."});}
};
