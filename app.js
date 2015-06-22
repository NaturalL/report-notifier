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
  //最新通知
  update(21530, 0);
  //即时更新
  update(20, 0);
  //学院新闻
  update(17, 0);
  setInterval(update, 1000*60*20, 21530, 0);
  setInterval(update, 1000*60*10, 20, 0);
  setInterval(update, 1000*60*30, 17, 0);
});



function update(catalog_id, page) {
  var chunkList = [];
  var contentLength = 0;

  var req = http.get("http://cspo.zju.edu.cn/redir.php?catalog_id=" + catalog_id +"&page="+page, function(res) {
    console.log("---------------cid: " + catalog_id +" page: " + page + " ---------------");

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
        'use strict'
        var $ = jquery(window);
        var k = children($('.container').eq(1), 7, 1);
        k = children(k, 0, 1);
        k = children(k, 4, 0).children('tr');
        var eq = 0;
        if(catalog_id == 20)
          eq = 1;
        var ret = getPosts(k, eq);
        window.close();
        notify(ret.list);
        if(ret.next)
          update(catalog_id, page+1);
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

function getPosts(k,eq) {
  var today = getToday();
  var len = k.length;
  var timestamp;
  var ret = {};
  ret.list = [];
  ret.next = true;

  for(var i = 0; i < len-1; i++) {
    //兼容即时更新页面
    if(k.eq(i).find('td').length < 3)
      continue;
    var postDate = k.eq(i).children('.header-yz');
    var title = k.eq(i).find('a').eq(eq).attr('title');
    var url = k.eq(i).find('a').eq(eq).attr('href');

    if(postDate.length == 0) continue;

    postDate = postDate.text().substr(1,10);
    var temp = Date.parse(postDate);
    //过期
    if(temp < today-oneDay*10) {
      ret.next = false;
      return ret;
    }

    if(title.indexOf('读书报告') < 0) continue;

    ret.list.push({
      title: title,
      url:   url
    });
  }
  return ret;
}


function isNotified(url, mail) {
  var id = url.slice(url.lastIndexOf("=")+1);
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
            notified.push({id:item.url.slice(item.url.lastIndexOf("=")+1), user:mail});
          });
          fs.writeFile('./notified.txt', JSON.stringify(notified));
          console.log("Message sent to " + mail);
        }
    });
  });
  transport.close();
}
