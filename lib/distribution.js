const CITY_RATES=[
["Kano","Kano","Kano",7000,3000,4500,18000,5,10],["Kaduna","Kaduna","Kano",12000,5000,7500,30000,5,10],["Katsina","Katsina","Kano",12000,5000,7500,30000,5,10],["Sokoto","Sokoto","Kano",18000,6000,9000,45000,5,10],["Bauchi","Bauchi","Jos",15000,5000,7500,38000,5,10],["Gombe","Gombe","Jos",17000,6000,9000,43000,5,10],["Maiduguri","Borno","Kano",22000,7000,10500,55000,5,10],["Abuja","FCT","Jos",15000,6000,9000,38000,5,10],["Jos","Plateau","Jos",7000,3000,4500,18000,5,10],["Minna","Niger","Jos",15000,5000,7500,38000,5,10],["Makurdi","Benue","Jos",15000,5000,7500,38000,5,10],["Ilorin","Kwara","Lagos",15000,6000,9000,38000,5,10],["Lokoja","Kogi","Jos",15000,5000,7500,38000,5,10],["Lagos","Lagos","Lagos",7000,3000,4500,18000,5,10],["Ibadan","Oyo","Lagos",12000,5000,7500,30000,5,10],["Abeokuta","Ogun","Lagos",10000,4000,6000,25000,5,10],["Akure","Ondo","Lagos",15000,6000,9000,38000,5,10],["Benin City","Edo","Lagos",17000,7000,10500,43000,5,10],["Aba","Abia","Aba",7000,3000,4500,18000,5,10],["Umuahia","Abia","Aba",9000,4000,6000,23000,5,10],["Enugu","Enugu","Aba",12000,5000,7500,30000,5,10],["Onitsha","Anambra","Aba",12000,5000,7500,30000,5,10],["Owerri","Imo","Aba",12000,5000,7500,30000,5,10],["Port Harcourt","Rivers","Aba",15000,6000,9000,38000,5,10],["Uyo","Akwa Ibom","Aba",17000,7000,10500,43000,5,10],["Calabar","Cross River","Aba",20000,8000,12000,50000,5,10],["Yenagoa","Bayelsa","Aba",20000,8000,12000,50000,5,10]
].map(([city,state,factory,mattress,small,medium,bulky,minDays,maxDays])=>({city,state,factory,mattress,small,medium,bulky,minDays,maxDays}));

const DISTRIBUTION_RULES={version:"1.2",includedPillowsWithMattress:4,pillowExtra5To10:2000,pillowExtra11To20:4000,bulkMattressThreshold:5,bulkPillowThreshold:21,customQuoteEnabled:false,maxDistributionFee:30000,minValueFactor:0.5,valueReferenceByClass:{small:200000,medium:300000,mattress:500000,bulky:500000}};
const CUSTOM_QUOTE_ENABLED=false;
const MAX_DISTRIBUTION_FEE=30000;
const MIN_VALUE_FACTOR=0.5;
const VALUE_REFERENCE_BY_CLASS={small:200000,medium:300000,mattress:500000,bulky:500000};

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
function orderValue(items){
 return (Array.isArray(items)?items:[]).reduce((sum,item)=>{
  const unit=Number(item?.unit_price_naira??item?.price??0);
  const qty=Math.max(0,Math.floor(Number(item?.qty||1)));
  return sum+(Number.isFinite(unit)?unit:0)*qty;
 },0);
}
function valueFactor(category,value){
 const reference=Number(VALUE_REFERENCE_BY_CLASS[category]||VALUE_REFERENCE_BY_CLASS.small);
 const raw=reference>0?Number(value||0)/reference:1;
 return Math.min(1,Math.max(MIN_VALUE_FACTOR,raw));
}

function calculateDistributionQuote(city,items){
 const rate=CITY_RATES.find(x=>x.city===city);if(!rate)throw new Error("This city is not currently covered by Jaman Store distribution.");
 const counts={mattress:0,small:0,medium:0,bulky:0};
 for(const item of(Array.isArray(items)?items:[])){const cls=classifyProduct(item);counts[cls]+=Math.max(0,Math.floor(Number(item.qty||1)));}
 if(CUSTOM_QUOTE_ENABLED&&(counts.mattress>=5||counts.small>=21))return{status:"quote_required",fee:null,category:"commercial",...rate,counts};
 if(CUSTOM_QUOTE_ENABLED&&counts.bulky>0)return{status:"quote_required",fee:null,category:"bulky",...rate,counts};

 let baseFee,category;
 if(counts.mattress>0){
  category="mattress";baseFee=rate.mattress*(counts.mattress===1?1:counts.mattress===2?1.5:2);
  if(counts.small>4&&counts.small<=10)baseFee+=2000;
  if(counts.small>10&&counts.small<=20)baseFee+=4000;
  if(CUSTOM_QUOTE_ENABLED&&counts.small>20)return{status:"quote_required",fee:null,category:"commercial",...rate,counts};
 }else if(counts.medium>0){
  category="medium";baseFee=rate.medium*(counts.medium<=4?1:counts.medium<=10?1.5:2);
 }else if(counts.bulky>0){
  category="bulky";baseFee=rate.bulky*(counts.bulky<=1?1:counts.bulky<=2?1.5:2);
 }else{
  category="small";baseFee=rate.small*(counts.small<=4?1:counts.small<=10?1.5:2);
 }

 const value=orderValue(items);
 const factor=valueFactor(category,value);
 const adjustedFee=baseFee*factor;
 const fee=Math.min(roundRate(adjustedFee),MAX_DISTRIBUTION_FEE);
 return{status:"fixed",fee,baseFee:roundRate(baseFee),orderValue:value,valueFactor:factor,category,...rate,counts};
}
if(typeof module!=="undefined")module.exports={CITY_RATES,DISTRIBUTION_RULES,classifyProduct,calculateDistributionQuote};
