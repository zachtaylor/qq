import { Network } from '@capacitor/network'

let online = $state(true)

Network.getStatus().then((status) => {
  online = status.connected
})
Network.addListener('networkStatusChange', (status) => {
  online = status.connected
})

export const network = {
  get online() {
    return online
  },
  get offline() {
    return !online
  },
}
