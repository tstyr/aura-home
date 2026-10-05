import http from 'node:http';
await import('./build.mjs');
const app=(await import('../api/entry.js')).default;
const port=Number(process.env.PORT)||4173;
http.createServer(async(req,res)=>{
 try{
  const request=new Request(new URL(req.url,`http://localhost:${port}`),{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:req,duplex:'half'}:{})});
  const result=await app.fetch(request);
  const cookies=result.headers.getSetCookie();if(cookies.length)res.setHeader('Set-Cookie',cookies);
  res.writeHead(result.status,Object.fromEntries([...result.headers].filter(([key])=>key!=='set-cookie')));
  res.end(Buffer.from(await result.arrayBuffer()));
 }catch{res.writeHead(500);res.end('Server error')}
}).listen(port,()=>console.log(`Aura Home: http://localhost:${port}`));
