'use strict';
const result=require('node:child_process').spawnSync('npm',['ci','--omit=dev'],{stdio:'inherit',shell:false});
if(result.status!==0)process.exit(result.status||1);
require('./check-live-candles');
