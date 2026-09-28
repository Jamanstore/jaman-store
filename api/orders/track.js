const SUPABASE_URL="https://ilzeavaseohrbmprditr.supabase.co";
const SUPABASE_SECRET_KEY=process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;
const rateWindow=new Map();
function send(res,status,payload){res.status(status).setHeader("Content-Type","application/json").end(JSON.stringify(payload));}
function clientIp(req){return String(req.headers["x-forwarded-for"]||req.headers["x-real-ip"]||"unknown").split(",")[0].trim().slice(0,80)||"unknown";}
function rateLimited(req){const now=Date.now(),key=clientIp(req),e=rateWindow.get(key);if(!e||now-e.start>600000){rateWindow.set(key,{start:now,count:1});return false;}e.count++;return e.count>20;}
module.exports=async(req,res)=>{
  if(req.method!=="GET") return send(res,405,{status:false,message:"Method not allowed"});
  if(rateLimited(req)) return send(res,429,{status:false,message:"Too many tracking attempts. Please wait a few minutes and try again."});
  if(!SUPABASE_SECRET_KEY) return send(res,503,{status:false,message:"Order tracking is temporarily unavailable."});
  const reference=String(req.query.reference||"").trim();
  const phone=String(req.query.phone||"").replace(/[^0-9+]/g,"").trim();
  if(!reference||reference.length>100||!/^[A-Za-z0-9_.=-]+$/.test(reference)||phone.length<7||phone.length>20) return send(res,400,{status:false,message:"Enter a valid order reference and phone number."});
  try{
    const url=SUPABASE_URL+"/rest/v1/orders?select=id,order_reference,customer_name,customer_phone,state,city,delivery_address,subtotal_naira,delivery_fee_naira,total_naira,status,payment_status,delivery_method,pickup_station_name,pickup_station_address,created_at,updated_at,dispatched_at,delivered_at,collected_at&order_reference=eq."+encodeURIComponent(reference)+"&customer_phone=eq."+encodeURIComponent(phone)+"&limit=1";
    const r=await fetch(url,{headers:{apikey:SUPABASE_SECRET_KEY,Authorization:"Bearer "+SUPABASE_SECRET_KEY}});
    if(!r.ok) return send(res,502,{status:false,message:"Unable to retrieve the order right now."});
    const rows=await r.json();
    if(!rows.length) return send(res,404,{status:false,message:"Order not found. Check the reference and phone number."});
    const order=rows[0];
    const hr=await fetch(SUPABASE_URL+"/rest/v1/order_status_history?select=status,note,created_at&order_id=eq."+encodeURIComponent(order.id)+"&order=created_at.asc",{headers:{apikey:SUPABASE_SECRET_KEY,Authorization:"Bearer "+SUPABASE_SECRET_KEY}});
    const history=hr.ok?await hr.json():[];
    return send(res,200,{status:true,order:{order_reference:order.order_reference,customer_name:order.customer_name,city:order.city,state:order.state,subtotal_naira:order.subtotal_naira,delivery_fee_naira:order.delivery_fee_naira,total_naira:order.total_naira,status:order.status,payment_status:order.payment_status,delivery_method:order.delivery_method,pickup_station_name:order.pickup_station_name,pickup_station_address:order.pickup_station_address,created_at:order.created_at,updated_at:order.updated_at,dispatched_at:order.dispatched_at,delivered_at:order.delivered_at,collected_at:order.collected_at},history});
  }catch(err){console.error("Order tracking error",err);return send(res,500,{status:false,message:"Unable to retrieve the order right now."});}
};