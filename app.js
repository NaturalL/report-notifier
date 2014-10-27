var http = require('http');
var iconvlite = require('iconv-lite');
var jquery = require('jquery');
var env = require('jsdom').env
var nodemailer = require('nodemailer');
var fs = require('fs');

var privateConfig = require('./privateConfig')


var oneDay = 24*60*60*1000;
var notified = [];
var subscribers = ['zjzj@zju.edu.cn'];

//launch
fs.readFile('./notified.txt', function (err, buf) {
  if(!err) {
    var obj = JSON.parse(buf.toString());
    if(obj instanceof Array)
      notified = obj;
  }
  update(0);
  setInterval(update, 1000*60*10, 0);
});



function update(page) {
  var chunkList = [];
  var contentLength = 0;

  var req = http.get("http://cspo.zju.edu.cn/redir.php?catalog_id=21530"+"&page="+page, function(res) {
    console.log("---------------page " + page + " ---------------");

    res.on('data', function(chunk) {
      contentLength += chunk.length;
      return chunkList.push(chunk);
    });
    res.on('end', function() {
      var chunk, pos = 0;

      var buffer = new Buffer(contentLength);

      for (var i = 0; i < chunkList.length; i++) {
          var chunk = chunkList[i];
          chunk.copy(buffer, pos);
          pos += chunk.length;
      }
      var html = iconvlite.decode(buffer, 'gb2312');
      env(html, function (errors, window) {

        var $ = jquery(window);
        var k = children($('.container').eq(1), 7, 1);
        k = children(k, 0, 1);
        k = children(k, 4, 0).children('tr');
        var ret = getPosts(k);
        window.close();
        notify(ret.list);
        if(ret.next)
          update(page+1);
        else {
          console.log('Update finished!  ' + new Date().toLocaleTimeString());
        }

      });
    });
  });

  req.on('error', function(e) {
    console.log("Got error: " + e.message);
    console.log('Update finished!  ' + new Date().toLocaleTimeString());
  });
}







function children(parent, n, i) {
  for(var _i = 0; _i <= n-1; _i++)
    parent = parent.children();
  return parent.children().eq(i);
}

function getPosts(k) {
  var today = getToday();
  var len = k.length;
  var timestamp;
  var ret = {};
  ret.list = [];
  ret.next = true;

  for(var i = 0; i < len-1; i++) {
    var postDate = k.eq(i).children('.header-yz');
    var title = k.eq(i).find('a').attr('title');
    var url = k.eq(i).find('a').attr('href');

    if(postDate.length == 0) continue;
    if(title.indexOf('读书报告') < 0) continue;

    postDate = postDate.text().substr(1,10);
    var temp = Date.parse(postDate);
    if(temp < today-oneDay*20) {
      ret.next = false;
      return ret;
    }
    ret.list.push({
      title: title,
      url:   url
    });
  }
  return ret;
}


function isNotified(url, mail) {
  var id = url.slice(-6);
  for(var i = 0; i < notified.length; i++) {
    if(notified[i].id == id && notified[i].user == mail)
      return true;
  }
  return false;
}



function getToday() {
  var t = new Date();
  t.setHours(0);
  t.setMinutes(0);
  t.setSeconds(0);
  return t.getTime();
}

function notify(list) {
  if(list.length == 0) return;
  
  var transport = nodemailer.createTransport({
    host: "smtp.zju.edu.cn",
    secure: true, // use SSL
    port: 994, // port for secure SMTP
    auth: {
        user: "zjzj",
        pass: privateConfig.pass
    }
  });

  subscribers.forEach(function(mail) {
    var html = "<h1>研究生读书报告通知</h1><h2>请在手机上设置提醒。</h2><ul>";
    var flag = false;
    list.forEach(function(item) {
      if(isNotified(item.url, mail)) return;
      flag = true;
      html += '<li><a href="http://cspo.zju.edu.cn/'+item.url+'">'+item.title+'</a></li>';
    });
    html += '</ul>';
    if(!flag) return;
    transport.sendMail({
      from : "zjzj@zju.edu.cn",
      to : mail,
      subject: "研究生读书报告通知",
      html : html
    }, function(error, response){
        if(error){
            console.log(error);
        }else{

          list.forEach(function(item) {
            notified.push({id:item.url.slice(-6), user:mail});
          });
          fs.writeFile('./notified.txt', JSON.stringify(notified));
          console.log("Message sent to " + mail);
        }
    });
  });
  transport.close();
}
