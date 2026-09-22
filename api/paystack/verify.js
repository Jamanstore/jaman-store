module.exports=async(req,res)=>{
if(req.method!=="GET")return res.status(405).json({status:false,message:"Method not allowed"});
if(!process.env.PAYSTACK_SECRET_KEY)return res.status(503).json({status:false,message:"Paystack is not configured."});
const reference=String(req.query.reference||"").trim();
if(!reference||reference.length>100||!/^[A-Za-z0-9_.=-]+$/.test(reference))return res.status(400).json({status:false,message:"A valid transaction reference is required."});
try{
const response=await fetch("https://api.paystack.co/transaction/verify/"+encodeURIComponent(reference),{headers:{Authorization:"Bearer "+process.env.PAYSTACK_SECRET_KEY}});
const payload=await response.json();
if(!response.ok||!payload.status)return res.status(502).json({status:false,message:payload.message||"Unable to verify transaction."});
const tx=payload.data||{},expected=Number(tx.metadata&&tx.metadata.order_total_kobo),amountVerified=Number.isFinite(expected)&&expected>0&&Number(tx.amount)===expected;
return res.status(200).json({status:true,verified:tx.status==="success"&&amountVerified,transaction_status:tx.status,reference:tx.reference,amount:tx.amount,currency:tx.currency,amount_verified:amountVerified});
}catch(err){console.error("Paystack verify error",err);return res.status(500).json({status:false,message:"Unable to verify payment."});}
};