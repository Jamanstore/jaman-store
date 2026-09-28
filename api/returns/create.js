const SUPABASE_URL="https://ilzeavaseohrbmprditr.supabase.co";
const SUPABASE_SECRET_KEY=process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;
const rateWindow=new Map();
function send(res,status,payload){res.status(status).setHeader("Content-Type","application/json").end(JSON.stringify(payload));}
function clientIp(req){return String(req.headers["x-forwarded-for"]||req.headers["x-real-ip"]||"unknown").split(",")[0].trim().slice(0,80)||"unknown";}
function rateLimited(req){const now=Date.now(),key=clientIp(req),e=rateWindow.get(key);if(!e||now-e.start>600000){rateWindow.set(key,{start:now,count:1});return false;}e.count++;return e.count>10;}
module.exports=async(req,res)=>{
  if(req.method!=="POST") return send(res,405,{status:false,message:"Method not allowed"});
  if(rateLimited(req)) return send(res,429,{status:false,message:"Too many requests. Please wait a few minutes and try again."});
  if(!SUPABASE_SECRET_KEY) return send(res,503,{status:false,message:"Return service is temporarily unavailable."});
  try{
    const body=typeof req.body==="string"?JSON.parse(req.body||"{}"):req.body||{};
    const allowed=["wrong_product","wrong_size"];
    if(!body.order_reference||!body.phone||!allowed.includes(body.reason)) return send(res,400,{status:false,message:"Order reference, phone number and a valid return reason are required."});
    const r=await fetch(SUPABASE_URL+"/rest/v1/rpc/create_return_request",{method:"POST",headers:{apikey:SUPABASE_SECRET_KEY,Authorization:"Bearer "+SUPABASE_SECRET_KEY,"Content-Type":"application/json"},body:JSON.stringify({
      p_order_reference:String(body.order_reference).trim(),
      p_customer_phone:String(body.phone).trim(),
      p_reason:body.reason,
      p_received_product_name:String(body.received_product_name||"").trim()||null,
      p_received_size:String(body.received_size||"").trim()||null,
      p_requested_product_name:String(body.requested_product_name||"").trim()||null,
      p_requested_size:String(body.requested_size||"").trim()||null,
      p_preferred_return_station:String(body.preferred_return_station||"").trim()||null,
      p_customer_note:String(body.customer_note||"").trim()||null
    })});
    const data=await r.json();
    if(!r.ok) return send(res,400,{status:false,message:data.message||data.hint||"Unable to submit the return request."});
    return send(res,200,{status:true,...data});
  }catch(err){console.error("Return request error",err);return send(res,400,{status:false,message:"Please check the details and try again."});}
};