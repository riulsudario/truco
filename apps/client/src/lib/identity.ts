import { load, save } from './storage'

/** This browser's secret token: it is what lets you return to the same seat. */
export function playerToken(): string {
  let token = load('truco:token', '')
  if (token.length < 16) {
    token = crypto.randomUUID()
    save('truco:token', token)
  }
  return token
}
