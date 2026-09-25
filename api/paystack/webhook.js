const crypto=require("crypto");
module.exports.config={api:{bodyParser:false}};
const SUPABASE_URL="https://ilzeavaseohrbmprditr.supabase.co";
function rawBody(req){return new Promise((resolve,reject)=>{const chunks=[];req.on("data",c=>chunks.push(Buffer.isBuffer(c)?c:Buffer.from(c)));req.on("end",()=>resolve(Buffer.concat(chunks).toString("utf8")));req.on("error",reject);});}
async function recordPayment(payload){
  const key=process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!key) throw new Error("Supabase server secret is not configured.");
  const response=await fetch(SUPABASE_URL+"/rest/v1/rpc/record_paystack_payment",{
    method:"POST",
    headers:{apikey:key,Authorization:"Bearer "+key,"Content-Type":"application/json"},
    body:JSON.stringify({p_payload:payload})
  });
  const data=await response.json();
  if(!response.ok) throw new Error(data.message||data.error||"Unable to record payment.");
  return data;
}
module.exports=async(req,res)=>{
  if(req.method!=="POST")return res.status(405).json({status:false,message:"Method not allowed"});
  if(!process.env.PAYSTACK_SECRET_KEY)return res.status(503).json({status:false,message:"Paystack is not configured."});
  try{
    const raw=await rawBody(req);
    const signature=req.headers["x-paystack-signature"];
    const expected=crypto.createHmac("sha512",process.env.PAYSTACK_SECRET_KEY).update(raw).digest("hex");
    if(!signature||signature!==expected)return res.status(401).json({status:false,message:"Invalid signature"});
    const event=JSON.parse(raw);
    if(event.event==="charge.success"){
      const result=await recordPayment(event);
      console.log("Jaman Store order recorded",JSON.stringify({reference:event.data&&event.data.reference,result}));
    }
    return res.status(200).json({status:true});
  }catch(err){
    console.error("Paystack webhook error",err);
    return res.status(400).json({status:false,message:"Webhook processing failed"});
  }
};