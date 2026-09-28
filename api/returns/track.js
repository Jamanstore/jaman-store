const SUPABASE_URL="https://ilzeavaseohrbmprditr.supabase.co";
const SUPABASE_SECRET_KEY=process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;
const rateWindow=new Map();
function send(res,status,payload){res.status(status).setHeader("Content-Type","application/json").end(JSON.stringify(payload));}
function clientIp(req){return String(req.headers["x-forwarded-for"]||req.headers["x-real-ip"]||"unknown").split(",")[0].trim().slice(0,80)||"unknown";}
function rateLimited(req){const now=Date.now(),key=clientIp(req),e=rateWindow.get(key);if(!e||now-e.start>600000){rateWindow.set(key,{start:now,count:1});return false;}e.count++;return e.count>20;}
module.exports=async(req,res)=>{
  if(req.method!=="GET") return send(res,405,{status:false,message:"Method not allowed"});
  if(rateLimited(req)) return send(res,429,{status:false,message:"Too many attempts. Please wait a few minutes and try again."});
  if(!SUPABASE_SECRET_KEY) return send(res,503,{status:false,message:"Return tracking is temporarily unavailable."});
  const reference=String(req.query.reference||"").trim(),orderReference=String(req.query.order_reference||"").trim(),phone=String(req.query.phone||"").replace(/[^0-9+]/g,"").trim();
  if(!reference||!orderReference||phone.length<7||phone.length>20) return send(res,400,{status:false,message:"Enter the return request reference, order reference and phone number."});
  try{
    const url=SUPABASE_URL+"/rest/v1/return_requests?select=request_reference,customer_name,reason,received_product_name,received_size,requested_product_name,requested_size,preferred_return_station,customer_note,status,admin_note,created_at,updated_at,approved_at,returned_at,verified_at,exchange_prepared_at,completed_at,orders!inner(order_reference,customer_phone)&request_reference=eq."+encodeURIComponent(reference)+"&orders.order_reference=eq."+encodeURIComponent(orderReference)+"&orders.customer_phone=eq."+encodeURIComponent(phone)+"&limit=1";
    const r=await fetch(url,{headers:{apikey:SUPABASE_SECRET_KEY,Authorization:"Bearer "+SUPABASE_SECRET_KEY}});
    if(!r.ok) return send(res,502,{status:false,message:"Unable to retrieve the return request right now."});
    const rows=await r.json();
    if(!rows.length) return send(res,404,{status:false,message:"Return request not found. Check the references and phone number."});
    return send(res,200,{status:true,request:rows[0]});
  }catch(err){console.error("Return tracking error",err);return send(res,500,{status:false,message:"Unable to retrieve the return request right now."});}
};