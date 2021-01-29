import state from './state'
import actions from './actions'
import mutations from './mutations'
import getters from './getters'
// const getters = {
//   newPrice(state) {
//     return state.newPrice
//   },
//   prevPrice(state) {
//     return state.prevPrice
//   }
// }
export default {
  namespaced: true,
  getters,
  state,
  actions,
  mutations
}
