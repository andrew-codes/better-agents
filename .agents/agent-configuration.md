# Agent configuration

All agents are configured at runtime via a shared YAML file located at:

```
~/.config/better-agents/config.yml
```

## Schema

```yaml
agents:
  - <agent-name>:
      model:
        name: sonnet-4.6          # Claude or OpenAI model name
        <modelOption>: <value>    # Provider-specific options (vary by provider)
      mcpServers:
        - name: <server-name>
          type: stdio
          command: <executable>
          args:
            - <arg>
          env:
            ENV_VAR: ${ENV_VAR_VALUE}   # Bash-style variable substitution
          tools:
            - <tool-name>              # Optional allowlist; omit to expose all tools
      config:
        <key>: <value>               # Agent-specific options (vary by agent)
      env:
        ENV_VAR: ${ENV_VAR_VALUE}    # Bash-style variable substitution
```

## Model support

Support Claude and OpenAI models. The `name` field identifies the model; additional keys under `model` are provider-specific options.

## Agent-level env vars

Environment variables defined under `env` are injected into the agent process at runtime. Values support `${VAR}` substitution from the parent shell environment. These are distinct from the `env` blocks on individual MCP servers, which only apply to that server's subprocess.

## Agent-specific config

Each agent may define its own configuration options under the `config` key. The shape of `config` is agent-defined — consult the individual agent's documentation for available keys. Unknown keys are ignored at runtime.

## MCP servers

- `stdio` type: spawns a new shell process with the given `command` and `args`.
- The process inherits all environment variables from the parent shell.
- Additional env vars can be injected via `env:` with `${VAR}` substitution.
- If `tools:` is specified, only the listed tool names are exposed to the agent; all others are hidden.
