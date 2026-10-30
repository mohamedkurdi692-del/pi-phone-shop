require('dotenv').config();
const express=require('express'),helmet=require('helmet'),rateLimit=require('express-rate-limit'),
multer=require('multer'),path=require('path'),crypto=require('crypto'),
admin=require('firebase-admin'),cloudinary=require('cloudinary').v2;
const PI='https://api.minepi.com/v2',KEY=process.env.PI_API_KEY;
['PI_API_KEY','FIREBASE_SERVICE_ACCOUNT','CLOUDINARY_URL'].forEach(k=>{if(!process.env[k]){console.error(k+' مفقود');process.exit(1)}});
admin.initializeApp({credential:admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))});
const db=admin.firestore(),P=db.collection('products'),O=db.collection('orders');
cloudinary.config({secure:true});

const app=express();
app.disable('x-powered-by');
app.set('trust proxy',1);
app.use(helmet({frameguard:false,contentSecurityPolicy:{directives:{
 defaultSrc:["'self'"],scriptSrc:["'self'","https://sdk.minepi.com"],
 imgSrc:["'self'","data:","https://res.cloudinary.com"],connectSrc:["'self'"],styleSrc:["'self'","'unsafe-inline'"],
 frameAncestors:["'self'","https://sandbox.minepi.com","https://app-cdn.minepi.com"]}}}));
app.use(express.json({limit:'20kb'}));
app.use('/api',rateLimit({windowMs:60000,max:60}));

const h=fn=>(req,res,next)=>fn(req,res,next).catch(e=>{console.error(e.message);res.status(500).json({error:'خطأ في الخادم'})});
const clean=(s,n)=>String(s||'').replace(/[<>]/g,'').trim().slice(0,n);
const validPrice=p=>Number.isFinite(p)&&p>0&&p<=1000000;
const pub=(id,p)=>({id,title:p.title,price:p.price,desc:p.desc,image:p.image,seller:p.sellerName,sellerUid:p.sellerUid});

const cache=new Map();
async function auth(req,res,next){
 const t=(req.headers.authorization||'').replace('Bearer ','');
 if(!t||t.length>2000)return res.status(401).json({error:'unauthorized'});
 const c=cache.get(t);if(c&&c.exp>Date.now()){req.user=c.u;return next()}
 try{
  const r=await fetch(PI+'/me',{headers:{Authorization:'Bearer '+t}});
  if(!r.ok)return res.status(401).json({error:'invalid token'});
  const u=await r.json();req.user={uid:u.uid,name:u.username};
  cache.set(t,{u:req.user,exp:Date.now()+300000});next();
 }catch{res.status(502).json({error:'pi unreachable'})}
}
const piKey=(m,p,b)=>fetch(PI+p,{method:m,headers:{Authorization:'Key '+KEY,'Content-Type':'application/json'},body:b?JSON.stringify(b):undefined});

const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:2*1024*1024,files:1},
 fileFilter:(q,f,cb)=>cb(['image/jpeg','image/png','image/webp'].includes(f.mimetype)?null:new Error('bad type'),true)});
const toCloud=buf=>new Promise((ok,no)=>cloudinary.uploader.upload_stream(
 {folder:'phones',resource_type:'image',allowed_formats:['jpg','png','webp']},(e,r)=>e?no(e):ok(r)).end(buf));

app.get('/api/products',h(async(q,r)=>{
 const s=await P.where('active','==',true).get();r.json(s.docs.map(d=>pub(d.id,d.data())))}));

app.post('/api/products',auth,(req,res)=>upload.single('image')(req,res,async e=>{
 try{
  if(e||!req.file)return res.status(400).json({error:'صورة غير صالحة (jpg/png/webp حتى 2MB)'});
  const price=Number(req.body.price),title=clean(req.body.title,80);
  if(!title||!validPrice(price))return res.status(400).json({error:'بيانات غير صحيحة'});
  const img=await toCloud(req.file.buffer);
  const p={sellerUid:req.user.uid,sellerName:req.user.name,title,price,desc:clean(req.body.desc,500),
   image:img.secure_url,imageId:img.public_id,active:true,createdAt:Date.now()};
  const ref=await P.add(p);res.json(pub(ref.id,p));
 }catch(x){console.error(x.message);res.status(500).json({error:'فشل رفع المنتج'})}
}));

async function own(req,res){
 const s=await P.doc(req.params.id).get(),p=s.data();
 if(!s.exists||!p.active||p.sellerUid!==req.user.uid){res.status(403).json({error:'غير مسموح'});return null}
 return{ref:s.ref,p};
}
app.put('/api/products/:id',auth,h(async(req,res)=>{
 const o=await own(req,res);if(!o)return;const u={};
 if(req.body.price!==undefined){const pr=Number(req.body.price);
  if(!validPrice(pr))return res.status(400).json({error:'سعر غير صحيح'});u.price=pr}
 if(req.body.title)u.title=clean(req.body.title,80);
 if(req.body.desc!==undefined)u.desc=clean(req.body.desc,500);
 await o.ref.update(u);res.json(pub(o.ref.id,{...o.p,...u}));
}));
app.delete('/api/products/:id',auth,h(async(req,res)=>{
 const o=await own(req,res);if(!o)return;
 const s=await O.where('productId','==',o.ref.id
