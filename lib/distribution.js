const CITY_RATES=[
["Kano","Kano","Kano",7000,3000,4500,18000,1,3],["Kaduna","Kaduna","Kano",12000,5000,7500,30000,2,4],["Katsina","Katsina","Kano",12000,5000,7500,30000,2,4],["Sokoto","Sokoto","Kano",18000,6000,9000,45000,3,5],["Bauchi","Bauchi","Jos",15000,5000,7500,38000,2,4],["Gombe","Gombe","Jos",17000,6000,9000,43000,2,5],["Maiduguri","Borno","Kano",22000,7000,10500,55000,4,7],["Abuja","FCT","Jos",15000,6000,9000,38000,2,4],["Jos","Plateau","Jos",7000,3000,4500,18000,1,3],["Minna","Niger","Jos",15000,5000,7500,38000,2,4],["Makurdi","Benue","Jos",15000,5000,7500,38000,2,4],["Ilorin","Kwara","Lagos",15000,6000,9000,38000,3,5],["Lokoja","Kogi","Jos",15000,5000,7500,38000,2,5],["Lagos","Lagos","Lagos",7000,3000,4500,18000,1,3],["Ibadan","Oyo","Lagos",12000,5000,7500,30000,2,4],["Abeokuta","Ogun","Lagos",10000,4000,6000,25000,2,4],["Akure","Ondo","Lagos",15000,6000,9000,38000,3,5],["Benin City","Edo","Lagos",17000,7000,10500,43000,3,5],["Aba","Abia","Aba",7000,3000,4500,18000,1,3],["Umuahia","Abia","Aba",9000,4000,6000,23000,1,3],["Enugu","Enugu","Aba",12000,5000,7500,30000,2,4],["Onitsha","Anambra","Aba",12000,5000,7500,30000,2,4],["Owerri","Imo","Aba",12000,5000,7500,30000,2,4],["Port Harcourt","Rivers","Aba",15000,6000,9000,38000,2,4],["Uyo","Akwa Ibom","Aba",17000,7000,10500,43000,3,5],["Calabar","Cross River","Aba",20000,8000,12000,50000,3,6],["Yenagoa","Bayelsa","Aba",20000,8000,12000,50000,3,6]
].map(([city,state,factory,mattress,small,medium,bulky,minDays,maxDays])=>({city,state,factory,mattress,small,medium,bulky,minDays,maxDays}));

const DISTRIBUTION_RULES={version:"1.0",includedPillowsWithMattress:4,pillowExtra5To10:2000,pillowExtra11To20:4000,bulkMattressThreshold:5,bulkPillowThreshold:21};

function classifyProduct(product){
 const category=String(product?.category||"").toLowerCase(),name=String(product?.name||"").toLowerCase();
 if(/hospital mattress/.test(name)||category.includes("mattress")||/mattress|compresso|restora|vithelix|vitaluxe/.test(name))return"mattress";
 if(category.includes("pillow"))return"small";
 if(category.includes("bedding"))return"medium";
 if(category.includes("furniture"))return name.includes("hospital mattress")?"mattress":"bulky";
 if(category.includes("mother")||category.includes("child"))return /cot|bed/.test(name)?"bulky":"medium";
 if(/sofa|bed|desk|cabinet|table|wardrobe|dining|stool/.test(name))return"bulky";
 if(/topper|leisuremat|duvet|blanket|comforter/.test(name))return"medium";
 return"small";
}

function roundRate(n){return Math.round(Number(n||0)/500)*500;}

function calculateDistributionQuote(city,items){
 const rate=CITY_RATES.find(x=>x.city===city);if(!rate)throw new Error("This city is not currently covered by Jaman Store distribution.");
 const counts={mattress:0,small:0,medium:0,bulky:0};
 for(const item of(Array.isArray(items)?items:[])){const cls=classifyProduct(item);counts[cls]+=Math.max(0,Math.floor(Number(item.qty||1)));}
 if(counts.mattress>=5||counts.small>=21)return{status:"quote_required",fee:null,category:"commercial",...rate,counts};
 if(counts.bulky>0)return{status:"quote_required",fee:null,category:"bulky",...rate,counts};
 let fee,category;
 if(counts.mattress>0){
  category="mattress";fee=rate.mattress*(counts.mattress===1?1:counts.mattress===2?1.5:2);
  if(counts.small>4&&counts.small<=10)fee+=2000;
  if(counts.small>10&&counts.small<=20)fee+=4000;
  if(counts.small>20)return{status:"quote_required",fee:null,category:"commercial",...rate,counts};
 }else if(counts.medium>0){
  category="medium";fee=rate.medium*(counts.medium<=4?1:counts.medium<=10?1.5:2);
 }else{
  category="small";fee=rate.small*(counts.small<=4?1:counts.small<=10?1.5:2);
 }
 return{status:"fixed",fee:roundRate(fee),category,...rate,counts};
}
if(typeof module!=="undefined")module.exports={CITY_RATES,DISTRIBUTION_RULES,classifyProduct,calculateDistributionQuote};
