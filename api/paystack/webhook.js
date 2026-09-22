const crypto=require("crypto");
module.exports.config={api:{bodyParser:false}};
function rawBody(req){return new Promise((resolve,reject)=>{const chunks=[];req.on("data",c=>chunks.push(Buffer.isBuffer(c)?c:Buffer.from(c)));req.on("end",()=>resolve(Buffer.concat(chunks).toString("utf8")));req.on("error",reject);});}
module.exports=async(req,res)=>{
if(req.method!=="POST")return res.status(405).json({status:false,message:"Method not allowed"});
if(!process.env.PAYSTACK_SECRET_KEY)return res.status(503).json({status:false,message:"Paystack is not configured."});
try{
const raw=await rawBody(req),signature=req.headers["x-paystack-signature"],expected=crypto.createHmac("sha512",process.env.PAYSTACK_SECRET_KEY).update(raw).digest("hex");
if(!signature||signature!==expected)return res.status(401).json({status:false,message:"Invalid signature"});
const event=JSON.parse(raw);
if(event.event==="charge.success")console.log("Paystack charge.success",JSON.stringify({reference:event.data&&event.data.reference,amount:event.data&&event.data.amount,status:event.data&&event.data.status}));
return res.status(200).json({status:true});
}catch(err){console.error("Paystack webhook error",err);return res.status(400).json({status:false,message:"Invalid webhook payload"});}
};