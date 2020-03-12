var selectdatafrom = function (pool, selectwhat, object) {
  var sql = `select ${selectwhat} from ${object}`
  return new Promise(function (resolve, reject) {
    pool.query(sql, (err, results) => {
      if (err) console.log(err)
      resolve(results)
    })
  })
}

var selectdatafromWhere = function (pool, selectwhat, object, where) {
  var sql = `select ${selectwhat} from ${object} where ${where}`
  return new Promise(function (resolve, reject) {
    pool.query(sql, (err, results) => {
      if (err) console.log(err)
      resolve(results)
    })
  })
}

var updatedatafromWhere = function (pool, object, set, where) {
  var sql = `UPDATE ${object} SET ${set} WHERE ${where}`
  return new Promise(function (resolve, reject) {
    pool.query(sql, (err, results) => {
      if (err) console.log(err)
      resolve(results)
    })
  })
}

var insertdataSet = function (pool, object, set) {
  var sql = `INSERT INTO ${object} SET ?`
  return new Promise(function (resolve, reject) {
    pool.query(sql, set, (err, results) => {
      if (err) reject(new Error('insertFail'))
      resolve(results)
    })
  })
}

module.exports.selectdatafrom = selectdatafrom
module.exports.selectdatafromWhere = selectdatafromWhere
module.exports.updatedatafromWhere = updatedatafromWhere
module.exports.insertdataSet = insertdataSet
