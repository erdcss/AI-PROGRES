import type { Express, Request, Response } from "express";
import { resolveAppAuth } from "../multi-user-auth";
import {
  countMaykDevices, listMaykEvents, registerMaykDevice,
  queueMaykTest, startMaykPushWorker, unregisterMaykDevice,
} from "../services/mayk-push.service";

async function authorize(req:Request,res:Response) {
  const auth=await resolveAppAuth(req);
  if(!auth)return res.status(401).json({success:false,error:"Oturum gerekli"});
  if(auth.systemRole!=="admin")return res.status(403).json({success:false,error:"Yönetici yetkisi gerekli"});
  return auth;
}
function sameOrigin(req:Request) {
  const origin=req.get("origin");
  if(origin) {
    try {if(new URL(origin).host!==req.get("host"))return false;}catch{return false;}
  }
  return req.get("x-requested-with")==="MAYK-IOS";
}
function errorResponse(res:Response,error:unknown) {
  return res.status(503).json({
    success:false,error:error instanceof Error?error.message:"Bildirim servisi kullanılamıyor",
  });
}
export function registerMaykPushRoutes(app:Express) {
  startMaykPushWorker();

  app.get("/api/mayk/push/status",async(req,res)=>{
    try{
      const auth=await authorize(req,res);
      if(!auth||!("userId" in auth))return;
      return res.json({success:true,enabledDevices:await countMaykDevices(auth.userId)});
    }catch(error){return errorResponse(res,error);}
  });

  app.get("/api/mayk/push/recent",async(req,res)=>{
    try{
      const auth=await authorize(req,res);
      if(!auth||!("userId" in auth))return;
      const limit=Number(req.query.limit || 40);
      return res.json({success:true,items:await listMaykEvents(limit)});
    }catch(error){return errorResponse(res,error);}
  });

  app.post("/api/mayk/push/register",async(req,res)=>{
    try{
      const auth=await authorize(req,res);
      if(!auth||!("userId" in auth))return;
      if(!sameOrigin(req))return res.status(403).json({success:false,error:"İstek kaynağı geçersiz"});
      await registerMaykDevice(String(req.body?.pushToken || ""),auth.userId);
      return res.json({success:true,enabled:true});
    }catch(error){
      const msg=error instanceof Error?error.message:"Bildirim bağlantısı kurulamadı";
      return res.status(/Geçersiz/.test(msg)?400:503).json({success:false,error:msg});
    }
  });

  app.post("/api/mayk/push/unregister",async(req,res)=>{
    try{
      const auth=await authorize(req,res);
      if(!auth||!("userId" in auth))return;
      if(!sameOrigin(req))return res.status(403).json({success:false,error:"İstek kaynağı geçersiz"});
      await unregisterMaykDevice(String(req.body?.pushToken || ""),auth.userId);
      return res.json({success:true});
    }catch(error){return errorResponse(res,error);}
  });

  app.post("/api/mayk/push/test",async(req,res)=>{
    try{
      const auth=await authorize(req,res);
      if(!auth||!("userId" in auth))return;
      if(!sameOrigin(req))return res.status(403).json({success:false,error:"İstek kaynağı geçersiz"});
      const deviceCount=await countMaykDevices(auth.userId);
      if(!deviceCount)return res.status(409).json({success:false,error:"Bildirim izni verilmiş iOS cihaz bulunamadı"});
      const queued=await queueMaykTest(auth.userId);
      return res.json({success:true,queued,deviceCount});
    }catch(error){return errorResponse(res,error);}
  });
}
