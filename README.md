# Porrinha Digital

Protótipo inicial da Porrinha Digital, separado do Bingo Familiar.

## Arquivos
- `index.html`: interface responsiva e regras básicas para testar no navegador.

## Testar
Abra `index.html` no Chrome ou publique a pasta como site estático.

## Estado desta versão
- 2 a 4 jogadores no mesmo aparelho (modo de teste passando o aparelho).
- 3 palitos iniciais por jogador.
- Escolha de 1 até a quantidade de palitos que ainda possui.
- Palpites sem repetição e dentro do total matematicamente possível.
- Revelação, soma, retirada de um palito ao acertar e vitória ao zerar.

## Próxima etapa: multiplayer real
Esta versão ainda não sincroniza celulares diferentes. Para isso, precisamos conectar uma sala online com autenticação/código de sala e armazenamento em tempo real (por exemplo, Firebase Realtime Database ou Supabase Realtime). As escolhas devem ser gravadas de forma privada por jogador e só reveladas quando todos confirmarem. Não coloque chaves privadas ou senhas no repositório.
