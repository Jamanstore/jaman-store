const SUPABASE_URL="https://ilzeavaseohrbmprditr.supabase.co";
const SUPABASE_SECRET_KEY=process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;

function json(res,status,payload){return res.status(status).json(payload);}
async function recordOrder(tx){
  if(!SUPABASE_SECRET_KEY) return {recorded:false,reason:"SUPABASE_SECRET_KEY is not configured in the server environment."};
  const metadata=typeof tx.metadata==="string"?JSON.parse(tx.metadata||"{}"):tx.metadata||{};
  const customer=metadata.customer||{};
  const items=Array.isArray(metadata.items)?metadata.items:[];
  const amountKobo=Number(tx.amount||0);
  const amountNaira=amountKobo/100;
  const payload={
    reference:String(tx.reference||""),
    amount_kobo:amountKobo,
    amount_naira:amountNaira,
    currency:String(tx.currency||"NGN"),
    gateway_response:String(tx.gateway_response||""),
    paid_at:tx.paid_at||tx.transaction_date||null,
    customer:{
      name:String(customer.name||"").trim(),
      email:String(tx.customer?.email||"").trim(),
      phone:String(customer.phone||"").trim(),
      state:String(customer.state||"").trim(),
      city:String(customer.city||"").trim(),
      address:String(customer.address||"").trim()
    },
    items:items.map(i=>({
      id:String(i.id||""),
      product_code:String(i.product_code||i.id||""),
      name:String(i.name||""),
      size:String(i.size||""),
      qty:Number(i.qty||1),
      unit_price_naira:Number(i.unit_price_naira||0)
    }))
  };
  const response=await fetch(SUPABASE_URL+"/rest/v1/rpc/record_verified_paystack_payment",{
    method:"POST",
    headers:{
      apikey:SUPABASE_SECRET_KEY,
      Authorization:"Bearer "+SUPABASE_SECRET_KEY,
      "Content-Type":"application/json"
    },
    body:JSON.stringify({p_payload:payload})
  });
  const text=await response.text();
  let data=null;try{data=JSON.parse(text)}catch{}
  if(!response.ok) throw new Error(data?.message||data?.hint||text||"Unable to record the verified order.");
  return {recorded:true,result:data};
}

module.exports=async(req,res)=>{
if(req.method!=="GET")return json(res,405,{status:false,message:"Method not allowed"});
if(!process.env.PAYSTACK_SECRET_KEY)return json(res,503,{status:false,message:"Paystack is not configured."});
const reference=String(req.query.reference||"").trim();
if(!reference||reference.length>100||!/^[A-Za-z0-9_.=-]+$/.test(reference))return json(res,400,{status:false,message:"A valid transaction reference is required."});
try{
const response=await fetch("https://api.paystack.co/transaction/verify/"+encodeURIComponent(reference),{headers:{Authorization:"Bearer "+process.env.PAYSTACK_SECRET_KEY}});
const payload=await response.json();
if(!response.ok||!payload.status)return json(res,502,{status:false,message:payload.message||"Unable to verify transaction."});
const tx=payload.data||{},expected=Number(tx.metadata&&tx.metadata.order_total_kobo),amountVerified=Number.isFinite(expected)&&expected>0&&Number(tx.amount)===expected;
let orderRecorded=false,orderRecordError=null,orderRecord=null;
if(tx.status==="success"&&amountVerified){
  try{
    const recorded=await recordOrder(tx);
    orderRecorded=recorded.recorded;
    orderRecord=recorded.result||null;
    if(!recorded.recorded) orderRecordError=recorded.reason;
  }catch(err){
    console.error("Paystack order recording error",err);
    orderRecordError=String(err?.message||err);
  }
}
return json(res,200,{
  status:true,
  verified:tx.status==="success"&&amountVerified,
  transaction_status:tx.status,
  reference:tx.reference,
  amount:tx.amount,
  currency:tx.currency,
  amount_verified:amountVerified,
  order_recorded:orderRecorded,
  order_record:orderRecord,
  order_record_error:orderRecordError
});
}catch(err){console.error("Paystack verify error",err);return json(res,500,{status:false,message:"Unable to verify payment."});}
};