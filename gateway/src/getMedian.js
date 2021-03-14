const axios = require('axios')
module.exports = async function getMedian(sheet, num, column) {
  // https://script.google.com/macros/s/AKfycbywCbXcKvK6xBlv478rt3LC0-W7EHYuSjqW6ykFKpyQuf0Z9Z7SGGxDr4DIU-jRj7Fz/exec?sheet=windex&num=31&column=L

  //     over4の最新
  // https://script.google.com/macros/s/AKfycbywCbXcKvK6xBlv478rt3LC0-W7EHYuSjqW6ykFKpyQuf0Z9Z7SGGxDr4DIU-jRj7Fz/exec?sheet=over4&num=20&column=J
  const { data } = await axios.get(`https://script.google.com/macros/s/AKfycbywCbXcKvK6xBlv478rt3LC0-W7EHYuSjqW6ykFKpyQuf0Z9Z7SGGxDr4DIU-jRj7Fz/exec`)
  return data
}
