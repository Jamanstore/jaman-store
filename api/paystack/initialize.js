const SUPABASE_URL="https://ilzeavaseohrbmprditr.supabase.co";
const SUPABASE_PUBLISHABLE_KEY="sb_publishable_3RYoXu_OVN6YtmLg1dolvA_mSugdq-O";

async function loadCatalog(){
  const response=await fetch(
    SUPABASE_URL+"/rest/v1/products?select=product_code,name,price_naira,sizes&active=eq.true",
    {headers:{apikey:SUPABASE_PUBLISHABLE_KEY,Authorization:"Bearer "+SUPABASE_PUBLISHABLE_KEY}}
  );
  if(!response.ok) throw new Error("Unable to load the current Jaman Store catalogue.");
  const rows=await response.json();
  return Object.fromEntries(rows.map(p=>[
    p.product_code,
    {name:p.name,price:Number(p.price_naira||0),sizes:Array.isArray(p.sizes)?p.sizes:[]}
  ]));
}

function send(res,status,payload){res.status(status).setHeader("Content-Type","application/json");res.end(JSON.stringify(payload));}
function validEmail(v){return typeof v==="string"&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());}
function siteUrl(req){return (process.env.SITE_URL||((req.headers["x-forwarded-proto"]||"https")+"://"+req.headers.host)).replace(/\/$/,"");}
module.exports=async(req,res)=>{
if(req.method!=="POST")return send(res,405,{status:false,message:"Method not allowed"});
if(!process.env.PAYSTACK_SECRET_KEY)return send(res,503,{status:false,message:"Paystack is not configured. Add PAYSTACK_SECRET_KEY in the hosting environment."});
try{
const body=typeof req.body==="string"?JSON.parse(req.body):(req.body||{}),customer=body.customer||{},items=Array.isArray(body.items)?body.items:[];
if(!validEmail(customer.email))return send(res,400,{status:false,message:"A valid customer email is required."});
if(!customer.name||!customer.phone||!customer.state||!customer.city||!customer.address)return send(res,400,{status:false,message:"Complete customer and delivery details are required."});
if(!items.length)return send(res,400,{status:false,message:"Your cart is empty."});
const CATALOG=await loadCatalog();
    const variantResponse=await fetch(SUPABASE_URL+"/rest/v1/product_variants?select=product_id,label,price_naira&active=eq.true",{headers:{apikey:SUPABASE_PUBLISHABLE_KEY,Authorization:"Bearer "+SUPABASE_PUBLISHABLE_KEY}});
    const variants=variantResponse.ok?await variantResponse.json():[];
    const VARIANTS=new Map(variants.map(v=>[v.product_id+"|"+v.label,Number(v.price_naira||0)]));
let total=0;const normalized=[];
for(const item of items){
const p=CATALOG[item.id],qty=Math.floor(Number(item.qty));
if(!p||p.price<=0||!Number.isInteger(qty)||qty<1||qty>50)return send(res,400,{status:false,message:"Invalid cart item."});
      const variantKey=Object.keys(CATALOG).find(k=>k===item.id);
      const variantPrice=variantKey&&VARIANTS.get((item.id)+"|"+item.size);
      const unitPrice=variantPrice>0?variantPrice:p.price;
const size=String(item.size||"").replace(/″/g,'"');
if(!p.sizes.includes(size))return send(res,400,{status:false,message:"Invalid size for "+p.name+"."});
total+=p.price*qty;normalized.push({id:item.id,name:p.name,size,qty,unit_price_naira:p.price});
}
const amount=Math.round(total*100),reference="JAMAN-"+Date.now()+"-"+Math.random().toString(36).slice(2,10).toUpperCase(),callback=siteUrl(req)+"/payment-success.html";
const metadata={order_reference:reference,order_total_kobo:amount,customer:{name:String(customer.name).trim(),phone:String(customer.phone).trim(),state:String(customer.state).trim(),city:String(customer.city).trim(),address:String(customer.address).trim()},items:normalized};
const response=await fetch("https://api.paystack.co/transaction/initialize",{method:"POST",headers:{"Authorization":"Bearer "+process.env.PAYSTACK_SECRET_KEY,"Content-Type":"application/json"},body:JSON.stringify({email:customer.email.trim(),amount,currency:"NGN",reference,callback_url:callback,metadata})});
const data=await response.json();
if(!response.ok||!data.status)return send(res,502,{status:false,message:data.message||"Paystack could not initialize the transaction."});
return send(res,200,{status:true,authorization_url:data.data.authorization_url,access_code:data.data.access_code,reference:data.data.reference});
}catch(err){console.error("Paystack initialize error",err);return send(res,500,{status:false,message:"Unable to start payment. Please try again."});}
};