# StreamWage Payroll

Prefunded on-chain ETH payroll. Employers deposit ETH upfront, workers accrue earnings over time and claim whenever they want. No intermediaries, no scheduled pushes.

Built with Solidity `^0.8.24`, OpenZeppelin upgradeable contracts, and a beacon proxy deployment pattern..

---

## Contracts

| Contract | Description |
|---|---|
| `StreamWagePayroll` | Core logic. Handles workers, accrual, claims, treasury, term negotiation, and address migration. |
| `StreamWagePayrollFactory` | Deploys isolated payroll instances via beacon proxy. Each wallet gets their own contract. |

---

## How it works

1. Deploy the factory once , it creates the beacon and implementation automatically.
2. Any wallet calls `deployPayroll(address initialOwner)` to get their own payroll instance.
3. Fund the treasury, add workers, done.

Workers claim their earnings at any time by calling `claim()` on their payroll contract directly.

---

## Deployment

```bash
# Install dependencies
forge install

# Run tests
forge test

# Deploy factory
forge script script/Deploy.s.sol --rpc-url <RPC_URL> --broadcast
```

> All payroll instances are deployed through the factory. Do not deploy `StreamWagePayroll` directly.

---

## Upgradeability

All proxies share one implementation via an `UpgradeableBeacon`. Upgrading the beacon upgrades every instance simultaneously. The beacon owner has full upgrade authority, this is an intentional centralization tradeoff documented in the design decisions.

---

## Documentation

Full documentation including architecture, core concepts, contract reference, and design decisions is available at the Gitbook.

> 📖 [StreamWage Docs](https://alameen.gitbook.io/streamwage)

---

## License

MIT
