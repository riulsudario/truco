import { load, save } from './storage'

/** Token secreto deste navegador: é o que permite voltar para a mesma cadeira. */
export function playerToken(): string {
  let token = load('truco:token', '')
  if (token.length < 16) {
    token = crypto.randomUUID()
    save('truco:token', token)
  }
  return token
}
