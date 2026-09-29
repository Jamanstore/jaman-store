const {CITY_RATES,DISTRIBUTION_RULES}=require("../lib/distribution");
module.exports=(req,res)=>{
 if(req.method!=="GET")return res.status(405).json({status:false,message:"Method not allowed"});
 res.setHeader("Cache-Control","public, max-age=300, s-maxage=300");
 return res.status(200).json({version:DISTRIBUTION_RULES.version,rates:CITY_RATES,rules:DISTRIBUTION_RULES});
};
