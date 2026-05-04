## Foundr



**Foundry is a blazing fast, portable and modular toolkit for Ethereum application development written in Rust.**

Foundry consists of:

- **Forge**: Ethereum testing framework (like Truffle, Hardhat and DappTools).
- **Cast**: Swiss army knife for interacting with EVM smart contracts, sending transactions and getting chain data.
- **Anvil**: Local Ethereum node, akin to Ganache, Hardhat Network.
- **Chisel**: Fast, utilitarian, and verbose solidity REPL.

## Documentation

https://book.getfoundry.sh/

## Usage

Solidity and Foundry live under `contract/`. Run Forge from that directory (or pass `--root contract`).

### Build

```shell
$ cd contract && forge build
```

### Test

```shell
$ cd contract && forge test
```

### Format

```shell
$ cd contract && forge fmt
```

### Gas Snapshots

```shell
$ cd contract && forge snapshot
```

### Anvil

```shell
$ anvil
```

### Deploy

```shell
$ cd contract && forge script <your_script_path>:<your_script_contract> --rpc-url <your_rpc_url> --private-key <your_private_key>
```

### Cast

```shell
$ cast <subcommand>
```

### Help

```shell
$ forge --help
$ anvil --help
$ cast --help
```
