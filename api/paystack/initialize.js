const CATALOG = {
corona:{name:"Vita Corona",price:33468.08,sizes:["6 × 4 × 8\"","6 × 5 × 8\"","6 × 6 × 8\"","6 × 6 × 10\"","6 × 6 × 12\"","6 × 7 × 10\"","6 × 7 × 12\""]},
grand:{name:"Vita Grand",price:86106.70,sizes:["6 × 4.5 × 10\"","6 × 5 × 10\"","6 × 6 × 10\"","6 × 6 × 12\"","6 × 7 × 10\"","6 × 7 × 12\""]},
haven:{name:"Vita Haven Mattress",price:105068.12,sizes:["6 × 4 × 8\"","6 × 4.5 × 10\"","6 × 5 × 10\"","6 × 6 × 10\"","6 × 6 × 12\"","6 × 7 × 12\""]},
shine:{name:"Vita Shine Mattress",price:29535.36,sizes:["6 × 3 × 6\"","6 × 3 × 8\"","6 × 4 × 8\"","6 × 5 × 8\"","6 × 6 × 8\""]},
supreme:{name:"Vita Supreme",price:133842.29,sizes:["6 × 4.5 × 10\"","6 × 5 × 10\"","6 × 6 × 10\"","6 × 6 × 12\"","6 × 7 × 12\""]},
"galaxy-classic":{name:"Vita Galaxy Classic",price:168109.16,sizes:["6 × 6 × 10\"","6 × 6 × 12\"","6 × 7 × 10\"","6 × 7 × 12\""]},
"galaxy-orthopedic":{name:"Vita Galaxy Orthopedic",price:206776.10,sizes:["6 × 6 × 10\"","6 × 6 × 12\"","6 × 7 × 10\"","6 × 7 × 12\""]},
"spring-flex":{name:"Vita Spring Flex",price:165637.11,sizes:["6 × 6 × 10\"","6 × 6 × 12\"","6 × 7 × 10\"","6 × 7 × 12\""]},
"cool-plus":{name:"Cool Plus Pillow",price:54080.85,sizes:["Standard"]},
vitacool:{name:"Vitacool Memory Pillow",price:24735.41,sizes:["Standard"]},
"vita-quilted":{name:"Vita Quilted",price:10490.64,sizes:["Standard"]},
flamingo:{name:"Flamingo",price:11249.04,sizes:["Standard"]}
};
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
let total=0;const normalized=[];
for(const item of items){
const p=CATALOG[item.id],qty=Math.floor(Number(item.qty));
if(!p||!Number.isInteger(qty)||qty<1||qty>50)return send(res,400,{status:false,message:"Invalid cart item."});
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