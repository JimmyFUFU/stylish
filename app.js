const express = require('express')
const bodyparser = require('body-parser')
const cookieparser = require('cookie-parser')
const mysql = require('mysql')
// const fs = require('fs')
const multer = require('multer')
const multerS3 = require('multer-s3')
const crypto = require('crypto')
const moment = require('moment')
const bearerToken = require('express-bearer-token')
const ejs = require('ejs')
const request = require('request')
const redis = require('redis')
const aws = require('aws-sdk')
const cst = require('./secret/const.js')

const app = express()

var fromMysql = require('./mysql.js')

app.use(bodyparser.urlencoded({
  extended: false
}))
app.use(bodyparser.json())
app.use(bearerToken())
app.use(cookieparser())
// app.set('view engine', 'pug')
app.engine('html', ejs.__express)
app.set('view engine', 'html')

// connect Redis
const client = redis.createClient() // this creates a new client for redis
client.on('connect', () => {
  console.log('Redis client connected')
})

// connect Database
/* const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '1234',
  database: 'stylish'
})
db.connect((err) => {
  if (err) console.log(err)
  else console.log('Mysql connected~~~~')
}) */
var pool = mysql.createPool({
  connectionLimit: 10,
  host: 'localhost',
  user: 'root',
  password: '1234',
  database: 'stylish'
})

// add static HTML in Data_Managemenet folder
app.use('/admin', express.static('Data_Managemenet'))
// add static image file
app.use('/upload', express.static('upload'))
// Home Page-/index.html  Product Page-/product.html  Thank You Page-/thankyou.html  Profile Page-/profile.html
app.use('/', express.static('fourhtml_css'))
// for https
app.use('/.well-known/acme-challenge', express.static('.well-known/acme-challenge'))

// upload image to S3 and named "ID_main_image" & "ID_images"
// upload picture to S3 and named "ID_campaigns_picture" // it will rename in /addcampaigns
const fileFilter = (req, file, cb) => {
  // 只接受三種圖片格式
  if (!file.originalname.match(/\.(jpg|jpeg|png)$/)) {
    cb(new Error('Please upload an image'))
  }
  cb(null, true)
}
const s3 = new aws.S3({
  secretAccessKey: cst.S3_SECRETACCESSKEY,
  accessKeyId: cst.S3_ACCESSKEYID
})
aws.config.update({
  region: 'ap-southeast-1'
})
const upload = multer({
  fileFilter: fileFilter,
  storage: multerS3({
    s3: s3,
    bucket: 'jimmyfufus3',
    acl: 'public-read',
    contentType: multerS3.AUTO_CONTENT_TYPE,
    metadata: function (req, file, cb) {
      cb(null, { fieldName: 'stylish' })
    },
    key: function (req, file, cb) {
      cb(null, req.body.id + '_' + file.fieldname)
    }
  })
})
const uploadProductImages = upload.fields([{ name: 'main_image', maxCount: 1 },
  { name: 'images_1', maxCount: 1 },
  { name: 'images_2', maxCount: 1 }])
const uploadCampaignImages = upload.single('campaign_picture')

// crypto MD5 Hex
function md5 (text) {
  return crypto.createHash('md5').update(text).digest('hex')
};

// add A product API
app.post('/addproduct', async (req, res, next) => {

  // upload main_image & images FIRST , get URL from S3
  var main_image_URL, images_1_URL, images_2_URL
  function getImageURL () {
    return new Promise(function (resolve, reject) {
      uploadProductImages(req, res, function (err) {
        if (err) console.log(err)
        main_image_URL = req.files.main_image[0].location
        images_1_URL = req.files.images_1[0].location
        images_2_URL = req.files.images_2[0].location
        resolve(true)
      })
    })
  }
  await getImageURL()
  console.log('upload images to S3 successfully !')

  // insert into product_object
  const productpost = {
    id: req.body.id,
    category: req.body.category,
    title: req.body.title,
    description: req.body.description,
    price: req.body.price,
    texture: req.body.texture,
    wash: req.body.wash,
    place: req.body.place,
    note: req.body.note,
    story: req.body.story,
    main_image: main_image_URL,
    images_1: images_1_URL,
    images_2: images_2_URL
  }
  try {
    await fromMysql.insertdataSet(pool, 'product_object', productpost)
    console.log(`Product created ! ( ID = ${req.body.id})`)

    // insert (id , colorcode) into unicolorproduct
    if (typeof (req.body.colors_code) === 'string') {
      const uniIDcolorcodepost = { product_id: req.body.id, color_code: req.body.colors_code }
      await fromMysql.insertdataSet(pool, 'unicolorproduct', uniIDcolorcodepost)
      console.log(`product_id (${req.body.id}) & color (${req.body.colors_code}) created in uni table !`)
    } else if (typeof (req.body.colors_code) === 'object') {
      for (let i = 0; i < req.body.colors_code.length; i++) {
        const uniIDcolorcodepost = { product_id: req.body.id, color_code: req.body.colors_code[i] }
        await fromMysql.insertdataSet(pool, 'unicolorproduct', uniIDcolorcodepost)
        console.log(`product_id (${req.body.id}) & color (${req.body.colors_code[i]}) created in uni table!`)
      }
    }

    // insert (id , size) into sizes_object
    if (typeof (req.body.sizecheckbox) === 'string') {
      const sizespost = { product_id: req.body.id, size: req.body.sizecheckbox }
      await fromMysql.insertdataSet(pool, 'sizes_object', sizespost)
      console.log('size created in sizes_object !')
    } else if (typeof (req.body.sizecheckbox) === 'object') {
      for (let i = 0; i < req.body.sizecheckbox.length; i++) {
        const sizespost = { product_id: req.body.id, size: req.body.sizecheckbox[i] }
        await fromMysql.insertdataSet(pool, 'sizes_object', sizespost)
        console.log(`${req.body.sizecheckbox[i]} created in sizes_object !`)
      }
    }

    // insert into color_object
    // 只有一種顏色
    if (typeof (req.body.colors_code) === 'string') {
      var colorpost = { colorcode: req.body.colors_code, name: req.body.colors_name }
      try {
        await fromMysql.insertdataSet(pool, 'color_object', colorpost)
        console.log(`${req.body.colors_name} created in color_object !`)
      } catch (e) {
        console.log(`${req.body.colors_name} already exists in color_object !`)
      }
    }
    // 兩種以上顏色
    else if (typeof (req.body.colors_code) === 'object') {
      for (let i = 0; i < req.body.colors_code.length; i++) {
        var colorpost = { colorcode: req.body.colors_code[i], name: req.body.colors_name[i] }
        try {
          await fromMysql.insertdataSet(pool, 'color_object', colorpost)
          console.log(`${req.body.colors_name[i]} created in color_object !`)
        } catch (e) {
          console.log(`${req.body.colors_name[i]} already exists in color_object !`)
        }
      }
    }

    // insert into variant_object
    // 只有一種規格
    if (typeof (req.body.variants_stock) === 'string') {
      var variantpost = { product_id: req.body.id, color_code: req.body.variants_color, size: req.body.variants_size, stock: req.body.variants_stock }
      await fromMysql.insertdataSet(pool, 'variant_object', variantpost)
      console.log('variant created !')
    }
    // 兩種以上規格
    if (typeof (req.body.variants_stock) === 'object') {
      for (let i = 0; i < req.body.variants_stock.length; i++) {
        var variantpost = { product_id: req.body.id, color_code: req.body.variants_color[i], size: req.body.variants_size[i], stock: req.body.variants_stock[i] }
        await fromMysql.insertdataSet(pool, 'variant_object', variantpost)
        console.log(`variant${i} created !`)
      }
    }

    res.send('Create product successfully')
  } catch (e) {
    console.log(`ID ${req.body.id} repeated !`)
    res.send(`ID ${req.body.id} repeated !`)
  }

})

// Product List API
app.get('/products/:category', async function (req, res) {
  var output = {}
  var data = []

  function getSQL () {
    var sql
    return new Promise(function (resolve, reject) {
      if (req.params.category === 'all') {
        sql = 'select id from product_object'
        resolve(sql)
      }
      else if (req.params.category === 'men' || req.params.category === 'women' || req.params.category === 'accessories') {
        sql = `select id from product_object where category = '${req.params.category}'`
        resolve(sql)
      }
      else if (req.params.category === 'search') {
        sql = `select id from product_object where title LIKE '%${req.query.keyword}%'`
        resolve(sql)
      }
      else if (req.params.category === 'details') {
        client.exists(`details_${req.query.id}`, function (err, reply) {
          if (err) console.log(err)
          // get details from Redis if exists
          if (reply === 1) {
            client.get(`details_${req.query.id}`, function (err, reply) {
              if (err) console.log(err)
              // 變回JSON object格式回傳
              var data = JSON.parse(reply)
              console.log(`details_${req.query.id} is From Redis`)
              res.send(data)
            })
          }
          // get details from Mysql if not exists
          else {
            sql = `select id from product_object where id = '${req.query.id}'`
            resolve(sql)
          }
        })
      }
    })
  }

  function findID (sql) {
    return new Promise(function (resolve, reject) {
      pool.query(sql, (err, results) => {
        if (err) console.log(err)
        else resolve(results)
      })
    })
  }

  function getProduct (currentID) {
    return new Promise(function (resolve, reject) {
      sql = `select id, category, title, description, price, texture, wash, place,
                        note, story, main_image, images_1, images_2 FROM product_object
                        WHERE product_object.id = ${currentID}`
      pool.query(sql, (err, results, fields) => {
        if (err) console.log(err)
        // var dataString = JSON.stringify(results)
        // var data = JSON.parse(dataString)
        resolve(results)
      })
    })
  }

  function getColor (currentID) {
    return new Promise(function (resolve, reject) {
      sql = `select  color_object.colorcode AS code,
                     color_object.name
                     FROM product_object , unicolorproduct ,color_object
                     where product_object.id = ${currentID} && unicolorproduct.product_id = product_object.id && unicolorproduct.color_code = color_object.colorcode`
      pool.query(sql, (err, results) => {
        if (err) console.log(err)
        // var dataString = JSON.stringify(results)
        // var data = JSON.parse(dataString)
        resolve(results)
      })
    })
  }

  function getSize (currentID) {
    return new Promise(function (resolve, reject) {
      sql = `select sizes_object.size FROM sizes_object
             where sizes_object.product_id = ${currentID}`
      pool.query(sql, (err, results) => {
        if (err) console.log(err)
        // var dataString = JSON.stringify(results)
        // var data = JSON.parse(dataString)
        resolve(results)
      })
    })
  }

  function getVariant (currentID) {
    return new Promise(function (resolve, reject) {
      sql = `select variant_object.color_code,
                    variant_object.size ,
                    variant_object.stock
                    FROM product_object ,variant_object
                    where product_object.id = ${currentID} && product_object.id = variant_object.product_id`
      pool.query(sql, (err, results) => {
        if (err) console.log(err)
        // var dataString = JSON.stringify(results)
        // var data = JSON.parse(dataString)
        resolve(results)
      })
    })
  }

  function pushInData (productlist, colorlist, sizelist, variantlist) {

    return new Promise(function (resolve, reject) {
      var colorarray = []
      var sizesarray = []
      var variantarray = []
      var imagesarray = []

      for (var i in colorlist) {
        colorarray.push({
          code: colorlist[i].code,
          name: colorlist[i].name
        })
      }
      for (var i in sizelist) {
        sizesarray.push(sizelist[i].size)
      }
      for (var i in variantlist) {
        variantarray.push({
          color_code: variantlist[i].color_code,
          size: variantlist[i].size,
          stock: variantlist[i].stock
        })
      }
      imagesarray.push(productlist[0].images_1, productlist[0].images_2)
      data.push({
        id: productlist[0].id,
        category: productlist[0].category,
        title: productlist[0].title,
        description: productlist[0].description,
        price: productlist[0].price,
        texture: productlist[0].texture,
        wash: productlist[0].wash,
        place: productlist[0].place,
        note: productlist[0].note,
        story: productlist[0].story,
        colors: colorarray,
        sizes: sizesarray,
        variants: variantarray,
        main_image: productlist[0].main_image,
        images: imagesarray
      })
      resolve(`push ${productlist[0].id} object in Data`)
    })
  }

  var sql = await getSQL()
  var id = await findID(sql)
  var IDlen = id.length
  var lastID = id[IDlen - 1].id
  var paging = req.query.paging || 0 // 頁數
  var lastpaging = Math.ceil(IDlen / 6) - 1 // 最後一頁的頁數
  if (paging < lastpaging) output.next_paging = Number(paging) + 1
  // 判斷一下有沒有資料 沒有就不用找
  if (IDlen === 0 || paging > lastpaging) {
    console.log('No Product Here !')
    output.data = []
    res.send(output)
  } else {
    for (let i = 0; i < 6; i++) {
      var index = 6 * Number(paging) + i
      if (id[index] !== undefined) var idToGet = id[index].id
      var productlist = await getProduct(idToGet)
      var colorlist = await getColor(idToGet)
      var sizelist = await getSize(idToGet)
      var variantlist = await getVariant(idToGet)
      var pushInDatalist = await pushInData(productlist, colorlist, sizelist, variantlist)
      console.log(pushInDatalist)
      if (productlist[0].id === lastID || i === 5) break
    }

    // detail dont need array
    if (req.params.category === 'details') {
      output.data = data[0]
      // 存進 Redis
      client.set(`details_${req.query.id}`, `${JSON.stringify(output)}`)
      client.expire(`details_${req.query.id}`, 3600) // expires after one hour
      console.log(`details_${req.query.id} 已換成 string 放進 redis (key = details_${req.query.id})`)
      console.log(`details_${req.query.id} is From Mysql`)
    } else output.data = data

    // console.log(output)
    res.send(output)
  }
})

// a total id API for admin/campaign.html and admin/product.html
app.get('/totalID', async function (req, res) {
  var allID = await fromMysql.selectdatafrom(pool, 'id', 'product_object')
  res.send(allID)
})

// add a  Marketing Campaigns API
app.post('/addcampaigns', async function (req, res, next) {

  // upload campaignimages FIRST , get URL from S3
  var campaign_image_URL
  function getImageURL () {
    return new Promise(function (resolve, reject) {
      uploadCampaignImages(req, res, function (err) {
        if (err) console.log(err)
        campaign_image_URL = req.file.location
        resolve(true)
      })
    })
  }

  await getImageURL()
  console.log('upload Campaign Images to S3 successfully !')

  // 先抓這個ID 有幾個campaign
  let campaign_count = await fromMysql.selectdatafromWhere(pool, 'campaign_count', 'product_object', `id = ${req.body.id}`)
  // 更改product_object 裡 campaign_count 的值
  await fromMysql.updatedatafromWhere(pool, 'product_object', 'campaign_count = campaign_count + 1', `id = ${req.body.id}`)
  console.log('product_object 裡的 campaign_count已經加1')
  var campaignIndex = campaign_count[0].campaign_count + 1

  // 放進campaign+_object
  let campaignpost = {
    product_id: req.body.id,
    picture: campaign_image_URL,
    story: req.body.story
  }
  await fromMysql.insertdataSet(pool, 'campaign_object', campaignpost)
  console.log(`Create a campaign for product_id = ${req.body.id} successfully and it has ${campaignIndex} campaigns now `)
  res.send(`Create a campaign for product_id = ${req.body.id} successfully and it has ${campaignIndex} campaigns now `)
  // delete key=campaigns in redis if there is a new campaigns added
  client.del('campaigns')
  console.log('Redis key = campaigns is deleted')

  // 把剛剛存進去的campaigns_picture_ID 改成 campaigns_picture_ID_campaignsIndex
  // const path = `${__dirname}/upload`
  // const files = fs.readdirSync(path)
  // fs.rename(path + `/campaign_picture_${req.body.id}.jpg`, path + `/campaigns_picture_${req.body.id}_${campaignIndex}.jpg`, function (err) {
  //   if (err) throw err
  //   console.log('picture rename successfully')
  // })
})

// Marketing Campaigns API
app.get('/marketing/campaigns', function (req, res) {
  var output = {}
  // 先看redis裡有沒有
  client.exists('campaigns', async function (err, reply) {
    if (err) console.log(err)
    // 存在
    if (reply === 1) {
      client.get('campaigns', function (err, reply) {
        if (err) console.log(err)
        // 變回JSON格式回傳
        var data = JSON.parse(reply)
        console.log('Campaigns Data is From Redis')
        output.data = data
        res.send(output)
      })
    }
    // 不存在 從資料庫拿
    else if (reply === 0) {
      var allCampaigns = await fromMysql.selectdatafrom(pool, 'campaign_id AS id , product_id , picture , story', 'campaign_object')
      client.set('campaigns', `${JSON.stringify(allCampaigns)}`)
      client.expire('campaigns', 3600) // expires after one hour
      console.log('campaigns 已換成 string 放進 redis (key = campaigns)')
      console.log('Campaigns Data is From Mysql')
      output.data = allCampaigns
      res.send(output)
    }
  })
})

// User Sign Up API
app.post('/user/signup', async function (req, res) {

  if (req.body.password === '' || req.body.name === '' || req.body.email === '') {
    var erroroutputUser = {}
    erroroutputUser['error'] = 'Request Error: name, email and password are required.'
    res.status(400).send(erroroutputUser)
  } else {
    // check Email exists or not
    const checkEmail = await fromMysql.selectdatafromWhere(pool, 'email', 'user_object', `email = "${req.body.email}"`)
    var outputUser = {}
    var data = {}
    var user = {} // object-only way~
    if (Object.keys(checkEmail).length === 0) {
      console.log('The email is valid , ready to insert into database')

      const time = moment().valueOf()
      // produce access_token by email + time Now
      const nowTime = moment(time).format('YYYYMMDDHHmmss')
      const token = md5(`${req.body.email}` + `${nowTime}`)
      // get the time One hour later as access_expired
      const expiredtime = moment(time).add(1, 'h').format('YYYY-MM-DD HH:mm:ss')

      const insertUserpost = {
        provider: 'native',
        name: req.body.name,
        email: req.body.email,
        password: req.body.password,
        access_token: token,
        access_expired: expiredtime
      }
      var insertUser = await fromMysql.insertdataSet(pool, 'user_object', insertUserpost)
      console.log('insert into user_object successfully ! Ready to select ID from user_object')
      var selectuser = await fromMysql.selectdatafromWhere(pool, 'id ,access_token ,access_expired', 'user_object', `email = "${req.body.email}"`)
      user['id'] = `${selectuser[0].id}`
      user['provider'] = 'native'
      user['name'] = `${req.body.name}`
      user['email'] = `${req.body.email}`
      user['picture'] = 'null'

      data['access_token'] = `${selectuser[0].access_token}`
      data['access_expired'] = `${selectuser[0].access_expired}`
      data['user'] = user

      outputUser['data'] = data
      res.send(outputUser)
    } else if (Object.keys(checkEmail).length > 0) {
      console.log('error : Email Already Exists')
      outputUser['error'] = 'Email Already Exists'
      res.status(403).send(outputUser)
    }
  }
})

// User Sign In API
app.post('/user/signin', async function (req, res) {

  var signInNULLOutputUser = {}
  if (req.body.provider === 'native') {
    if (req.body.email === '' || req.body.password === '') {
      signInNULLOutputUser['error'] = 'Request Error: email and password are required.'
      res.status(400).send(signInNULLOutputUser)
    } else {
      var userdetails = await fromMysql.selectdatafromWhere(pool, '*', 'user_object', `email = '${req.body.email}' && password = '${req.body.password}'`)
      if (Object.keys(userdetails).length === 0) {
        console.log('The user is Not found')
        let signInOutputUser = { error: 'Sign In Error' }
        res.status(403).send(signInOutputUser)
      } else {
        // Give a new access_token and new access_expired everytime the user Signin
        let time = moment().valueOf()
        // produce a new access_token by email + time Now
        let nowTime = moment(time).format('YYYYMMDDHHmmss')
        let token = md5(`${req.body.email}` + `${nowTime}`)
        // get the time One hour later as new access_expired
        let expiredtime = moment(time).add(1, 'h').format('YYYY-MM-DD HH:mm:ss') // 一小時過期
        // let expiredtime = moment(time).add(30, "s").format('YYYY-MM-DD HH:mm:ss');//30s過期

        var updateTokenExpired = await fromMysql.updatedatafromWhere(pool, 'user_object', `provider = '${req.body.provider}' , access_token = '${token}', access_expired = '${expiredtime}'`, `email = '${req.body.email}'`)
        console.log('NEW Sign In !! UPDATE provider and token and expired successfully ~ ')
        let signInOutputUser = {}
        let data = {}
        let user = {}
        user['id'] = `${userdetails[0].id}`
        user['provider'] = `${userdetails[0].provider}`
        user['name'] = `${userdetails[0].name}`
        user['email'] = `${userdetails[0].email}`
        user['picture'] = `${userdetails[0].picture}`
        data['access_token'] = `${token}`
        data['access_expired'] = `${expiredtime}`
        data['user'] = user
        signInOutputUser['data'] = data
        res.send(signInOutputUser)
        console.log('The user is found')
      }
    }
  } else if (req.body.provider === 'facebook') {
    if (req.body.access_token == null) {
      signInNULLOutputUser['error'] = 'Request Error: access token is required.'
      res.status(400).send(signInNULLOutputUser)
    } else {
      // if FB access_token exists  // get information from Facebook API
      request(`https://graph.facebook.com/v5.0/me?fields=id%2Cname%2Cemail&access_token=${req.body.access_token}`, (error, response, body) => {
        if (error) console.log(error)
        var userdata = JSON.parse(body)

        if (userdata.error == null) {
          let time = moment().valueOf()
          // produce access_token by email + time Now
          let nowTime = moment(time).format('YYYYMMDDHHmmss')
          let token = md5(`${userdata.email}` + `${nowTime}`)

          // get the time One hour later as access_expired
          let expiredtime = moment(time).add(1, 'h').format('YYYY-MM-DD HH:mm:ss')

          let fbsignInpost = {
            provider: 'facebook',
            name: userdata.name,
            email: userdata.email,
            access_token: token,
            access_expired: expiredtime,
            fb_id: userdata.id,
            fb_access_token: req.body.access_token
          }
          let fbsignInsql = `INSERT INTO user_object SET ?
                              ON DUPLICATE KEY UPDATE name = VALUES(name),
                                                     email = VALUES(email),
                                              access_token = VALUES(access_token),
                                            access_expired = VALUES(access_expired),
                                           fb_access_token = VALUES(fb_access_token)` // 如果FB的ID有重複 就更新使用者資料
          pool.query(fbsignInsql, fbsignInpost, async (err, results) => {
            if (err) console.log(err)
            else {
              console.log('FB signIN !! Insert into user_object successfully ! Ready to select ID from user_object')
              let userdatafromMysql = await fromMysql.selectdatafromWhere(pool, 'id ,access_token ,access_expired', 'user_object', `email = "${userdata.email}"`)
              var outputUser = {}
              var data = {}
              var user = {}
              user['id'] = `${userdatafromMysql[0].id}`
              user['provider'] = 'facebook'
              user['name'] = `${userdata.name}`
              user['email'] = `${userdata.email}`
              user['picture'] = 'null'

              data['access_token'] = `${userdatafromMysql[0].access_token}`
              data['access_expired'] = `${userdatafromMysql[0].access_expired}`
              data['user'] = user

              outputUser['data'] = data
              res.send(outputUser)
            }
          })
        } else {
          res.status(400).send(userdata)
        }
      })
    }
  } else {
    const signInOutputUser = { error: 'Wrong Request' }
    res.status(400).send(signInOutputUser)
  }
})

// User Profile API
app.get('/user/profile', async function (req, res) {

  if (!req.headers.authorization) {
    const noAuth = { error: 'Wrong Request: authorization is required.' }
    res.status(403).send(noAuth)
  } else {
    //  let findtokensql = `select * from user_object where access_token = '${req.token}'`
    var findtoken = await fromMysql.selectdatafromWhere(pool, '*', 'user_object', `access_token = '${req.token}'`)
    if (Object.keys(findtoken).length === 0) {
      const invalidToken = { error: 'Invalid Access Token' }
      res.status(403).send(invalidToken)
    } else {
      var time = moment().valueOf()
      var expiredtime = findtoken[0].access_expired
      // Is expiredtime early than now?
      if (moment(expiredtime).isBefore(time) === false) {
        let useroutput = {}
        let user = {}

        user['id'] = `${findtoken[0].id}`
        user['provider'] = `${findtoken[0].provider}`
        user['name'] = `${findtoken[0].name}`
        user['email'] = `${findtoken[0].email}`
        user['picture'] = `${findtoken[0].picture}`

        useroutput['data'] = user
        res.status(200).send(useroutput)
      } else {
        const invalidToken = { error: 'The token is expired , Please sign in again' }
        res.status(403).send(invalidToken)
      }
    }
  }
})

// Order Check Out API
app.post('/order/checkout', async function (req, res) {
  // store in database with the order status "unpaid"
  // nowTime
  const time = moment().valueOf()
  const nowTime = moment(time).format('YYYYMMDDHHmmss')
  const orderdetailpost = {
    orderlist_id: nowTime,
    name: req.body.order.recipient.name,
    email: req.body.order.recipient.email,
    phone: req.body.order.recipient.phone,
    address: req.body.order.recipient.address,
    delivertime: req.body.order.recipient.time,
    subprice: req.body.order.subtotal,
    freight: req.body.order.freight,
    totalprice: req.body.order.total,
    listlength: '1',
    order_status: 'unpaid'
  }
  const insertorderdetail = await fromMysql.insertdataSet(pool, 'orderdetail_object', orderdetailpost)
  console.log("Insert into orderdetail_object successfully with 'unpaid' status ")

  let orderlistpost = {
    orderdetail_id: nowTime,
    product_id: req.body.order.list[0].id,
    colorname: req.body.order.list[0].color.name,
    size: req.body.order.list[0].size,
    OnePieceprice: req.body.order.list[0].price,
    quantity: req.body.order.list[0].qty,
    subprice_ThisProduct: req.body.order.list[0].price * req.body.order.list[0].qty
  }
  const insertorderlist = await fromMysql.insertdataSet(pool, 'orderlist_object', orderlistpost)
  console.log('Insert into orderlist_object successfully')
  // req.body.ListLengthInCart

  // Pay by prime
  const post_data = {
    "prime": req.body.prime,
    "partner_key": "partner_PHgswvYEk4QY6oy3n8X3CwiQCVQmv91ZcFoD5VrkGFXo8N7BFiLUxzeG",
    "merchant_id": "AppWorksSchool_CTBC",
    "amount": req.body.order.total,
    "currency": "TWD",
    "details": "some clothes from stylish.",
    "cardholder": {
      "phone_number": req.body.order.recipient.phone,
      "name": req.body.order.recipient.name,
      "email": req.body.order.recipient.email
    },
    "remember": false
  }

  var options = {
    url: 'https://sandbox.tappaysdk.com/tpc/payment/pay-by-prime',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': 'partner_PHgswvYEk4QY6oy3n8X3CwiQCVQmv91ZcFoD5VrkGFXo8N7BFiLUxzeG'
    }
  }
  const post_req = request.post(options, async function (error, response, body) {
    if (error) console.log(error)
    var result = JSON.parse(body)
    if (result.status === 0) {
      // update order_status to 'paid'
      var updateToPaid = await fromMysql.updatedatafromWhere(pool, 'orderdetail_object', 'order_status = \'paid\'', `orderlist_id = '${nowTime}'`)
      console.log(`orderlist_id ${nowTime} has already update to "paid"`)

      // output orderlist_id
      var output = {}
      var data = {}
      data['number'] = nowTime
      output['data'] = data
      res.send(output)
    } else {
      res.send(result)
    }
  })
  post_req.write(JSON.stringify(post_data))
  post_req.end()
})

// listen
app.listen(3000, function () {
  console.log('Stylish is running on port 3000!')
})
