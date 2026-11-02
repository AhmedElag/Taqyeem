import {config,assertOrigin,jsonBody,json,secureResponse,HttpError,fail,one,requireRole} from './core.mjs';
import {authentication,handleAuth,requireCsrf} from './auth.mjs';
import {workspace,report} from './workspace.mjs';
import {handleAdmin} from './admin.mjs';
import {handleEvaluation,handleFiles} from './evaluations.mjs';

export default {
  async fetch(request,env,ctx){
    let cfg;
    try{
      cfg=config(env);const url=new URL(request.url);const path=url.pathname;
      // No CORS: the application and authenticated API share one exact origin.
      if(url.origin!==cfg.origin)fail(421,'incorrect_origin','Open the configured application address.');
      if(!path.startsWith('/api/')){
        if(!['GET','HEAD'].includes(request.method))fail(405,'method_not_allowed','This method is not available.');
        if(!env.ASSETS)fail(503,'assets_missing','Build and bind the application assets before deployment.');
        const response=await env.ASSETS.fetch(request);return secureResponse(response,cfg);
      }
      if(!env.DB)fail(503,'database_not_configured','The database binding is missing.');
      if(path==='/api/health'&&request.method==='GET'){
        try{const schema=await one(env.DB,'SELECT version FROM schema_meta WHERE version=1');if(!schema)throw new Error();await one(env.DB,'SELECT id FROM users LIMIT 1');}catch(_){fail(503,'database_not_ready','Apply the database migrations before starting Taqyeem.');}
        return secureResponse(json({ok:true,app:'Taqyeem'}),cfg);
      }
      if(!['GET','POST','PATCH','PUT','DELETE'].includes(request.method))fail(405,'method_not_allowed','This method is not available.');
      let body={};if(request.method!=='GET'){assertOrigin(request,cfg);body=await jsonBody(request);}
      const auth=await authentication(request,env,cfg);const authResponse=await handleAuth(path,request,body,env,cfg,auth,ctx);if(authResponse)return secureResponse(authResponse,cfg);
      if(path.startsWith('/api/auth/')||path==='/api/session')fail(404,'not_found','This endpoint is not available.');
      await requireRole(auth?.user,'admin','doctor','student');if(request.method!=='GET')requireCsrf(request,auth);const actor=auth.user;
      let response;
      if(path==='/api/workspace'&&request.method==='GET')response=await workspace(env,cfg,actor);
      else if(path==='/api/reports'&&request.method==='GET')response=await report(request,env,actor);
      else response=await handleAdmin(path,request,body,env,cfg,actor)||await handleEvaluation(path,request,body,env,cfg,actor)||await handleFiles(path,request,body,env,cfg,actor);
      if(!response)fail(404,'not_found','This endpoint is not available.');return secureResponse(response,cfg);
    }catch(error){
      if(error instanceof HttpError)return secureResponse(json({error:{code:error.code,message:error.message}},error.status),cfg);
      // Deliberately exclude exception text: database errors may contain identifiers or content.
      console.error('Taqyeem request failed.');return secureResponse(json({error:{code:'internal_error',message:'The request could not be completed. Please try again.'}},500),cfg);
    }
  }
};
