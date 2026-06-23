---
name: clean-code-agents
description: |
  Aplicar os princípios de Clean Code adaptados para a era dos agentes de IA (2026+), onde o leitor primário do código não é mais humano, mas sim um LLM. Use esta skill SEMPRE que o usuário perguntar sobre boas práticas de código em projetos que usam agentes de IA, Claude Code, Cursor, Codex ou qualquer coding agent. Também disparar para: "como organizar meu código pra IA entender melhor", "meu agente tá errando muito", "custo de token alto", "agente fica perdido no repositório", "CLAUDE.md", "AGENTS.md", "cursor rules", "código limpo para LLM", "context engineering", "token budget", "alucinação do agente", "arquivo muito grande pra IA", "agente não acha o código certo". Esta skill sintetiza o artigo "Clean Code pra Agentes de IA" (Akita, 2026) com pesquisa sobre otimização de contexto e custo de token em produção.
---

# Clean Code para Agentes de IA (2026+)

## O Contexto: O Leitor Primário Mudou

Em 2008, Uncle Bob escreveu Clean Code para humanos. Em 2026, o leitor primário do código é o **agente de IA** — não o programador que vai sentar para manter amanhã. Essa mudança de leitor muda as regras.

O agente tem restrições técnicas diferentes do humano:
- **Context window finito**: cada arquivo lido consome tokens; tokens custam dinheiro e latência
- **Sem memória persistente**: o agente não lembra do que leu em sessões anteriores sem re-carregar
- **Tool calls têm custo**: cada `read_file`, `grep`, `list_dir` é uma operação com overhead
- **"Lost in the middle"**: LLMs degradam performance com informação irrelevante no contexto — mais contexto nem sempre é melhor, e pode ser pior

Pesquisa mostra que agentes gastam até 80% do budget de tokens só **navegando** o código para encontrar o que precisam, não resolvendo o problema. Irrelevant context degrades LLM accuracy em mais de 30%.

---

## Princípios Re-ranqueados para a Era dos Agentes

### 🔴 CRÍTICO — Muito mais importante do que antes

**1. Tipagem Estática e Anotações de Tipo**

Em 2008 era preferência de estilo. Em 2026 é **restrição técnica**.

- Go: tipos explícitos, interfaces claras → custo zero extra, já é a linguagem
- Python sem type hints → agente precisa inferir tipo a partir de uso em contexto; erra frequentemente
- TypeScript > JavaScript puro
- Ruby sem RBS → mais raciocínio perdido

Assinatura de função tipada diz tudo: o que entra, o que sai, quais estados são válidos. O agente economiza tool calls de descoberta.

```go
// BOM: agente entende sem ler o corpo
func FindClientByTaxID(ctx context.Context, taxID TaxID) (*Client, error)

// RUIM: agente precisa rastrear chamadas para inferir tipos
func FindClient(ctx context.Context, id interface{}) (interface{}, error)
```

**2. Nomes Extremamente Descritivos**

Para humanos, nomes longos são verbosos. Para agentes, nomes são **índice de busca semântica**. O agente frequentemente encontra o código certo pelo nome da função sem nem precisar abrir o arquivo.

```go
// BOM: agente sabe onde ir sem read_file
func CalculateMonthlyInstallmentWithIOF(principal decimal.Decimal, months int) decimal.Decimal

// RUIM: agente precisa ler o corpo para entender
func calc(p decimal.Decimal, m int) decimal.Decimal
```

**3. DRY (Don't Repeat Yourself) — Ainda Mais Crítico**

Duplicação para humano = manutenção ruim. Duplicação para agente = **atualização parcial certa**.

Quando o agente precisa mudar algo replicado em 3 lugares, ele pode atualizar 1 e esquecer os outros 2. O código compila, o agente acredita que terminou, mas o comportamento está errado.

**4. Funções e Arquivos Pequenos**

Para humanos era "preferível". Para agentes é **métricamente verificável**:
- Arquivos grandes forçam mais tokens no contexto
- Arquivos grandes aumentam latência de tool call
- O agente lê o arquivo inteiro mesmo para uma mudança de 3 linhas

Regra prática: funções < 30 linhas, arquivos < 300 linhas. Se está passando disso, é candidato a split.

```
# Estrutura que o agente navega bem
lawkit/
├── client/
│   ├── repository.go      # apenas persistência
│   ├── service.go         # apenas regras de negócio
│   └── handler.go         # apenas HTTP
```

---

### 🟡 AINDA VÁLIDO — Continua valendo pelos mesmos motivos

**5. SRP (Single Responsibility Principle)**

Arquivo com uma responsabilidade → agente sabe exatamente onde ir para um tipo de mudança. Não precisa navegar para descobrir onde está o que precisa.

**6. Injeção de Dependência**

Dependências explícitas por parâmetro/construtor → o agente entende o grafo de dependências sem executar o código. Facilita mock, teste, e raciocínio sobre side effects.

**7. Tratamento Explícito de Erros**

Go-style: erros como valores retornados, sem panic escondido. O agente raciocina sobre fluxo de controle com muito mais precisão quando erros são explícitos e tipados.

---

### 🔻 REBAIXADO — Era opinião, virou restrição; ou era ruim, ficou pior

**8. Comentários Óbvios → Proibidos**

Em 2008: poluía visual. Em 2026: **custa dinheiro real em tokens**.

```go
// BAD — consome tokens sem agregar valor
// i é o índice do loop
for i := 0; i < len(clients); i++ {

// GOOD — comentário só quando há "por quê" não óbvio
// CPF validation uses MOD-11 algorithm (Receita Federal spec 2023)
func validateCPF(cpf string) bool {
```

**9. Números Mágicos → Constantes Nomeadas**

Mais crítico que antes: o agente não tem memória de "reunião onde decidiram esse valor". A constante é a única documentação que ele vê.

**10. Arquivos Enormes → Erro de Arquitetura**

Para humanos: desconfortável. Para agentes: **penalidade de performance medida**. Um arquivo de 2000 linhas pode degradar a qualidade do output em tarefas simples no canto do arquivo.

---

## Novos Princípios — Específicos da Era dos Agentes

### 📋 Meta-Documentação para Agentes (AGENTS.md / CLAUDE.md)

Este é um **skill novo** que não existia em 2008. São arquivos que o agente lê antes de qualquer tool call, descrevendo as convenções do projeto.

**Formato recomendado** (curto, imperativo, orientado a ações):

```markdown
# AGENTS.md

## Stack
- Go 1.26, PostgreSQL 16, Redis 7
- Framework: sem framework HTTP externo, stdlib net/http
- ORM: sqlc (gerado), sem GORM

## Comandos Essenciais
- `make test` — roda todos os testes
- `make lint` — golangci-lint
- `make migrate` — aplica migrations pendentes
- `air` — live reload para desenvolvimento

## Convenções
- Erros: sempre retornar `error` como último valor, nunca panic em código de produção
- Context: sempre propagar `ctx context.Context` como primeiro parâmetro
- Nomes de arquivo: snake_case, sufixo pelo papel (_repository.go, _service.go, _handler.go)
- Testes: arquivo _test.go no mesmo pacote, usar testify/assert

## Proibido
- Nunca usar `interface{}` sem justificativa no PR
- Nunca commitar sem `make lint` passar
- Nunca colocar lógica de negócio em handlers

## Caveats
- O módulo `internal/lgpd` tem retenção especial: ver internal/lgpd/README.md
- Migrations são irreversíveis em produção, sempre revisar com DBA
```

**Regras para escrever AGENTS.md:**
- Curto: 50-150 linhas máximo
- Imperativo: "Nunca use X", "Sempre faça Y"
- Orientado a ações: comandos reais, não filosofia
- Pontue os caveats: onde o agente pode se dar mal sem aviso

### 🗂️ Estrutura de Diretório como Documentação

A estrutura de pastas é o "mapa" do agente. Ela precisa ser auto-explicativa antes de abrir qualquer arquivo.

```
# Estrutura que comunica intenção
cmd/
  lawkit-api/     # entrypoint da API
  lawkit-worker/  # workers assíncronos
internal/
  auth/           # autenticação/autorização
  client/         # domínio: clientes
  document/       # domínio: documentos
  lgpd/           # conformidade LGPD (isolado por razão legal)
  infra/
    db/           # conexão e migrations
    redis/        # cache e pub/sub
pkg/
  cpf/            # validação CPF (reutilizável)
  cnpj/           # validação CNPJ (reutilizável)
```

O agente lê o diretório primeiro. Se ele consegue deduzir onde está o código pelo nome da pasta, economiza tool calls.

### 📏 Orçamento de Contexto (Token Budget)

Ao estruturar código para agentes, pense em **custo de contexto**:

| Antipadrão | Custo | Solução |
|-----------|-------|---------|
| Arquivo 2000 linhas | ~3000 tokens só para ler | Split em arquivos por responsabilidade |
| Duplicação em 5 lugares | Agente lê todos para entender | DRY + funções compartilhadas |
| Comentários óbvios densos | Tokens desperdiçados | Comentários apenas para "por quê" |
| Nomes crípticos | Agente lê mais código para inferir | Nomes descritivos como documentação |
| Sem AGENTS.md | Agente explora o projeto inteiro | Meta-documentação explícita |

### 🧪 Testes como Especificação

Testes bem escritos são **documentação executável** para o agente. Quando o agente lê os testes antes de fazer uma mudança, ele entende o comportamento esperado sem precisar rastrear todo o código de produção.

```go
// Teste que documenta a regra de negócio para o agente
func TestCPFValidation_RejectsSequentialDigits(t *testing.T) {
    // CPFs com dígitos repetidos são inválidos (e.g., 111.111.111-11)
    // mesmo que o MOD-11 passasse, a Receita Federal bloqueia esses casos
    assert.False(t, ValidateCPF("11111111111"))
    assert.False(t, ValidateCPF("00000000000"))
}
```

Nome do teste = especificação. O agente sabe o "por quê" sem precisar de mais contexto.

### 🔒 Interfaces Pequenas e Focadas

Interfaces grandes forçam o agente a carregar mais contexto para entender o contrato. Interfaces pequenas são mais fáceis de raciocinar e mockar.

```go
// BOM: agente entende o contrato em 2 linhas
type ClientFinder interface {
    FindByTaxID(ctx context.Context, taxID TaxID) (*Client, error)
}

// RUIM: agente precisa entender 15 métodos para usar 1
type ClientRepository interface {
    FindByTaxID(...)
    FindByEmail(...)
    FindByID(...)
    Create(...)
    Update(...)
    Delete(...)
    List(...)
    // ... mais 8 métodos
}
```

---

## Checklist Prático

Antes de fechar um PR em projeto com agentes:

- [ ] Existe `AGENTS.md` ou `CLAUDE.md` atualizado na raiz?
- [ ] Nenhum arquivo novo tem mais de 300 linhas?
- [ ] Todas as funções públicas têm tipos explícitos (Go nativo; Python com type hints)?
- [ ] Nomes de funções são autoexplicativos sem ler o corpo?
- [ ] Sem comentários óbvios (só comentários de "por quê")?
- [ ] Sem duplicação de lógica (DRY)?
- [ ] Estrutura de diretório reflete domínios de negócio?
- [ ] Testes descrevem o comportamento esperado no nome?

---

## Resumo: O que Mudou, o que Ficou

| Princípio | 2008 | 2026 |
|-----------|------|------|
| Nomes descritivos | Bom para humanos | Índice de busca semântica do agente |
| Funções pequenas | Preferência de legibilidade | Restrição de token budget |
| DRY | Manutenção | Evita atualização parcial do agente |
| Tipagem forte | Estilo de linguagem | Economiza raciocínio do agente |
| Sem comentários óbvios | Visual limpo | Custo real em tokens |
| AGENTS.md / CLAUDE.md | Não existia | Skill novo e obrigatório |
| Estrutura de diretório | Organização | Mapa de navegação do agente |

> "Quem escreve código limpo pro agente economiza dinheiro de conta de API, tempo de sessão, e tem menos alucinação no output." — Akita, 2026

---

## Referências

- Akita (2026): "Clean Code pra Agentes de IA" — https://akitaonrails.com/2026/04/20/clean-code-para-agentes-de-ia/
- Jake Nesler (2026): AI coding agents spend 80% of token budget on orientation, not problem solving
- Liu et al. (2024): "Lost in the Middle" — irrelevant context degrades LLM accuracy >30%
- Redis (2026): Token optimization in production LLM apps
- SAGA Architecture (Daniel/Anthropic): AGENTS.md como skill fundamental de multi-agent systems
