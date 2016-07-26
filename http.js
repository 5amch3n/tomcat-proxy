var fs = require('fs');
var auth = require('basic-auth');
var http = require('http');
var httpProxy = require('http-proxy');

var USERNAME = 'put your username here';
var PASSWORD = 'put your password here'; // or load them from env

// http and websocket proxies
var addresses = [
  {
    host: 'localhost',
    port: 8180,
    protocol: 'http'
  },
  {
    host: 'localhost',
    port: 8180,
    protocol: 'ws'
  },
  
  {
    host: 'localhost',
    port: 8280,
    protocol: 'http'
  },
  {
    host: 'localhost',
    port: 8280,
    protocol: 'ws'
  }
];

var instance_status = '0000'.split('');
function readInstanceStatus(){
  var txt = fs.readFileSync('./instance_status.txt', 'utf8');
  instance_status = txt.toString().split('');
}
function writeInstanceStatus(){
  fs.writeFile('./instance_status.txt', instance_status.join(''), {"encoding":'utf8'}, function(err){
    if(err) console.log('Oops! Error occurred writing file: ' + err);
  });
}
readInstanceStatus();

function findTarget(protocol){
  protocol = protocol||'http';
  for(var i=0,l=addresses.length;i<l;i++){
    if((addresses[i].protocol||'http') == protocol && instance_status[i]==='1'){
      return {target:addresses[i]};
    }
  }
  return null;
}
var proxy = httpProxy.createServer();
var server = http.createServer(function(req, res){
  if(/\/balancer\/.*/.test(req.url)) {
    var credentials = auth(req);

    if (!credentials || credentials.name !== USERNAME || credentials.pass !== PASSWORD) {
      res.statusCode = 401
      res.setHeader('WWW-Authenticate', 'Basic realm="someco.com"')
      res.end('Access denied')
      return;
    }

    if('/balancer/status' == req.url) {
      echoStatus(res);
    } else if(/\/balancer\/up\/\d*/.test(req.url)) {
      var indexes = req.url.substring(13);
      indexes.split(',').forEach(function(i){
        instance_status[i] = '1';    
      });
      echoStatus(res);
      writeInstanceStatus();
    } else if(/\/balancer\/down\/\d*/.test(req.url)) {
      var indexes = req.url.substring(15);
      indexes.split(',').forEach(function(i){
        instance_status[i] = '0';    
      });
      echoStatus(res);
      writeInstanceStatus();
    }
  } else {
    var target = findTarget();
    if(target) {
      proxy.web(req, res, target);
    } else {
      res.writeHead(200, {'Content-Type': 'text/html'});
      res.end('<div style="color:red">Sorry, but we cannot find any server that is up and running to serve your request. Please try again later.</div>');
    }
  }
});

server.on('upgrade', function(req, socket, head){
  var target = findTarget('ws');
  if(target) {
    proxy.ws(req, socket, head, target);  
  } else {
    console.log('No ws proxy found');  
  }
});
server.listen(8888);

console.log('server running at 8888...');

function echoStatus(res) {
  res.writeHead(200, {'Content-Type': 'text/html'});
  res.end(getStatus());  
}
function getStatus() {
  var html = [];
  addresses.forEach(function(server, index){
    var color = ( instance_status[index] == '1' ? 'green' : 'red' );
    var updown = ( instance_status[index] == '1' ? 'Up' : 'Down' );
    html.push('<li><span style="color:', color, '">' + server.host + ':' + server.port + ' : ', updown, '</span></li>')     
  })
  return html.join('')
}
