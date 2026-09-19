import React, { useState, useEffect } from 'react';
import {
  X,
  Coins,
  ShieldCheck,
  ShieldAlert,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Building,
} from 'lucide-react';
import {
  RegistrySummary,
  fetchRegistrySummary,
  transact,
  resetRegistry,
} from '../api/client';
import { formatInt } from '../utils';

interface CreditRegistryModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentSiteId: string;
  calculationHash: string;
  defaultTradableUnits: number;
}

export const CreditRegistryModal: React.FC<CreditRegistryModalProps> = ({
  isOpen,
  onClose,
  currentSiteId,
  calculationHash,
  defaultTradableUnits,
}) => {
  const [summary, setSummary] = useState<RegistrySummary | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'ledger' | 'transact'>('ledger');
  const [txAction, setTxAction] = useState<'issue' | 'transfer' | 'retire'>('issue');
  const [filterType, setFilterType] = useState<string>('ALL');

  // Form states
  const [units, setUnits] = useState<number>(defaultTradableUnits || 100);
  const [account, setAccount] = useState<string>('Developer');
  const [fromAccount, setFromAccount] = useState<string>('Developer');
  const [toAccount, setToAccount] = useState<string>('Buyer');
  const [beneficiary, setBeneficiary] = useState<string>('Corporate ESG Client');
  const [reason, setReason] = useState<string>('NetZero 2026 Scope 1 Offset');
  const [txStatus, setTxStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);

  const loadSummary = async () => {
    setLoading(true);
    try {
      const data = await fetchRegistrySummary();
      setSummary(data);
    } catch (e: any) {
      console.error('Failed to load registry:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadSummary();
      setUnits(defaultTradableUnits || 100);
      setTxStatus(null);
    }
  }, [isOpen, defaultTradableUnits]);

  if (!isOpen) return null;

  const handleExecuteTx = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setTxStatus(null);

    try {
      const payload: any = {
        action: txAction,
        units: Number(units),
      };

      if (txAction === 'issue') {
        payload.account = account;
        payload.site_id = currentSiteId;
        payload.calculation_hash = calculationHash;
      } else if (txAction === 'transfer') {
        payload.from_account = fromAccount;
        payload.to_account = toAccount;
      } else if (txAction === 'retire') {
        payload.from_account = fromAccount;
        payload.beneficiary = beneficiary;
        payload.reason = reason;
      }

      const res = await transact(payload);
      setTxStatus({
        type: 'success',
        message: res.message || `Транзакция ${res.tx_id} выполнена успешно`,
      });
      await loadSummary();
    } catch (err: any) {
      setTxStatus({
        type: 'error',
        message: err.message || 'Ошибка выполнения транзакции',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = async () => {
    if (!window.confirm('Сбросить реестр к демонстрационному состоянию?')) return;
    setLoading(true);
    try {
      await resetRegistry();
      await loadSummary();
      setTxStatus({ type: 'success', message: 'Реестр сброшен к исходному состоянию' });
    } catch (e: any) {
      setTxStatus({ type: 'error', message: e.message || 'Ошибка сброса' });
    } finally {
      setLoading(false);
    }
  };

  const isConserved = summary?.conservation_verified ?? false;
  const filteredTxs =
    summary?.transactions.filter((tx) =>
      filterType === 'ALL' ? true : tx.action.toUpperCase() === filterType
    ) || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="relative flex max-h-[90vh] w-full max-w-4xl flex-col rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Coins className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-white">Реестр углеродных единиц (Demo Ledger)</h3>
                <span className="rounded bg-zinc-800 px-2 py-0.5 font-mono text-[10px] text-emerald-400 border border-emerald-500/20">
                  ERC-CARBON SIMULATOR
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                Эмиссия, передача и верифицированное погашение углеродных офсетов
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-white transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Summary KPIs & Conservation Badge */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-3">
              <div className="text-[11px] font-medium text-zinc-400 uppercase">Всего выпущено</div>
              <div className="mt-1 text-xl font-bold text-white">
                {formatInt(summary?.total_issued)} <span className="text-xs text-zinc-500">ед.</span>
              </div>
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-3">
              <div className="text-[11px] font-medium text-zinc-400 uppercase">В обращении</div>
              <div className="mt-1 text-xl font-bold text-emerald-400">
                {formatInt(
                  Object.values(summary?.active_balances || {}).reduce((a, b) => a + b, 0)
                )}{' '}
                <span className="text-xs text-zinc-500">ед.</span>
              </div>
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-3">
              <div className="text-[11px] font-medium text-zinc-400 uppercase">Погашено (Retired)</div>
              <div className="mt-1 text-xl font-bold text-zinc-300">
                {formatInt(summary?.total_retired)}{' '}
                <span className="text-xs text-zinc-500">ед.</span>
              </div>
            </div>

            {/* Conservation Status Card */}
            <div
              className={`rounded-xl border p-3 flex flex-col justify-between ${
                isConserved
                  ? 'border-emerald-500/40 bg-emerald-950/20 text-emerald-300'
                  : 'border-rose-500/40 bg-rose-950/20 text-rose-300'
              }`}
            >
              <div className="text-[11px] font-medium uppercase">Закон сохранения</div>
              <div className="flex items-center gap-1.5 font-bold text-sm">
                {isConserved ? (
                  <>
                    <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0" />
                    <span>ИНВАРИАНТ СОБЛЮДЁН</span>
                  </>
                ) : (
                  <>
                    <ShieldAlert className="h-4 w-4 text-rose-400 shrink-0" />
                    <span>НАРУШЕНИЕ БАЛАНСА</span>
                  </>
                )}
              </div>
              <div className="text-[10px] text-zinc-400 mt-1">
                Issued = Active ({Object.values(summary?.active_balances || {}).reduce((a, b) => a + b, 0)}) + Retired ({summary?.total_retired || 0})
              </div>
            </div>
          </div>

          {/* Account Balances Pill Row */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
            <div className="text-xs font-semibold text-zinc-400 mb-2 uppercase tracking-wider">
              Балансы участников реестра:
            </div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(summary?.active_balances || {}).map(([acc, bal]) => (
                <div
                  key={acc}
                  className="flex items-center gap-2 rounded-lg bg-zinc-800/80 px-3 py-1.5 border border-zinc-700/60 text-xs"
                >
                  <Building className="h-3.5 w-3.5 text-zinc-400" />
                  <span className="font-medium text-zinc-200">{acc}:</span>
                  <span className="font-mono font-bold text-emerald-400">{formatInt(bal)} ед.</span>
                </div>
              ))}
            </div>
          </div>

          {/* Tabs: Transaction History vs New Transaction */}
          <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setActiveTab('ledger')}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  activeTab === 'ledger'
                    ? 'bg-emerald-500 text-zinc-950 shadow'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                Книга транзакций ({loading ? '...' : summary?.transactions.length || 0})
              </button>
              <button
                onClick={() => setActiveTab('transact')}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  activeTab === 'transact'
                    ? 'bg-emerald-500 text-zinc-950 shadow'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                + Новая операция
              </button>
            </div>

            <button
              onClick={handleReset}
              className="flex items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1 text-xs text-zinc-400 hover:text-white hover:border-zinc-700 transition"
              title="Сброс реестра к демо-состоянию"
            >
              <RotateCcw className="h-3 w-3" />
              <span>Сбросить демо</span>
            </button>
          </div>

          {/* Tab 1: Transaction Ledger Table */}
          {activeTab === 'ledger' && (
            <div className="space-y-3">
              {/* Filter pills */}
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-zinc-500 mr-1">Фильтр:</span>
                {['ALL', 'ISSUE', 'TRANSFER', 'RETIRE'].map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilterType(f)}
                    className={`rounded-md px-2 py-0.5 transition ${
                      filterType === f
                        ? 'bg-zinc-700 text-white font-semibold'
                        : 'text-zinc-400 hover:bg-zinc-800'
                    }`}
                  >
                    {f === 'ALL'
                      ? 'Все'
                      : f === 'ISSUE'
                      ? 'Выпуск'
                      : f === 'TRANSFER'
                      ? 'Перевод'
                      : 'Погашение'}
                  </button>
                ))}
              </div>

              <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/50">
                <div className="max-h-[260px] overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 bg-zinc-900 text-zinc-400 text-[11px] uppercase tracking-wider">
                      <tr className="border-b border-zinc-800">
                        <th className="py-2 px-3 font-semibold">ID</th>
                        <th className="py-2 px-3 font-semibold">Тип</th>
                        <th className="py-2 px-3 font-semibold">Отправитель</th>
                        <th className="py-2 px-3 font-semibold">Получатель</th>
                        <th className="py-2 px-3 text-right font-semibold">Объём</th>
                        <th className="py-2 px-3 font-semibold">Детали</th>
                        <th className="py-2 px-3 font-semibold">Время (UTC)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-850">
                      {filteredTxs.map((tx) => (
                        <tr key={tx.tx_id} className="hover:bg-zinc-800/40">
                          <td className="py-2 px-3 font-mono text-zinc-500">{tx.tx_id}</td>
                          <td className="py-2 px-3">
                            <span
                              className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                                tx.action === 'issue'
                                  ? 'bg-emerald-500/20 text-emerald-400'
                                  : tx.action === 'transfer'
                                  ? 'bg-blue-500/20 text-blue-400'
                                  : 'bg-rose-500/20 text-rose-400'
                              }`}
                            >
                              {tx.action.toUpperCase()}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-zinc-300 font-mono text-[11px]">
                            {tx.from || tx.from_account || '—'}
                          </td>
                          <td className="py-2 px-3 text-zinc-300 font-mono text-[11px]">
                            {tx.to || tx.to_account || '—'}
                          </td>
                          <td className="py-2 px-3 text-right font-mono font-bold text-white">
                            {formatInt(tx.units)}
                          </td>
                          <td className="py-2 px-3 text-zinc-400 text-[11px]">
                            {tx.batch_id || tx.beneficiary || tx.reason || '—'}
                          </td>
                          <td className="py-2 px-3 font-mono text-zinc-500 text-[10px]">
                            {tx.timestamp ? tx.timestamp.replace('T', ' ').slice(0, 19) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Tab 2: New Transaction Form */}
          {activeTab === 'transact' && (
            <form onSubmit={handleExecuteTx} className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setTxAction('issue')}
                  className={`flex-1 rounded-lg py-2 text-xs font-semibold transition border ${
                    txAction === 'issue'
                      ? 'bg-emerald-500 text-zinc-950 border-emerald-400'
                      : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-white'
                  }`}
                >
                  Выпуск единиц (Issue)
                </button>
                <button
                  type="button"
                  onClick={() => setTxAction('transfer')}
                  className={`flex-1 rounded-lg py-2 text-xs font-semibold transition border ${
                    txAction === 'transfer'
                      ? 'bg-blue-500 text-zinc-950 border-blue-400'
                      : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-white'
                  }`}
                >
                  Передача (Transfer)
                </button>
                <button
                  type="button"
                  onClick={() => setTxAction('retire')}
                  className={`flex-1 rounded-lg py-2 text-xs font-semibold transition border ${
                    txAction === 'retire'
                      ? 'bg-rose-500 text-zinc-950 border-rose-400'
                      : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-white'
                  }`}
                >
                  Погашение (Retire)
                </button>
              </div>

              {/* Status Message */}
              {txStatus && (
                <div
                  className={`flex items-center gap-2 rounded-lg p-3 text-xs ${
                    txStatus.type === 'success'
                      ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30'
                      : 'bg-rose-500/10 text-rose-300 border border-rose-500/30'
                  }`}
                >
                  {txStatus.type === 'success' ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                  ) : (
                    <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
                  )}
                  <span>{txStatus.message}</span>
                </div>
              )}

              {/* Form fields */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">
                    Объём углеродных единиц:
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={units}
                    onChange={(e) => setUnits(parseInt(e.target.value) || 0)}
                    className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                {txAction === 'issue' && (
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">
                      Счёт зачисления:
                    </label>
                    <input
                      type="text"
                      required
                      value={account}
                      onChange={(e) => setAccount(e.target.value)}
                      className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                    />
                  </div>
                )}

                {txAction === 'transfer' && (
                  <>
                    <div>
                      <label className="block text-xs text-zinc-400 mb-1">
                        Счёт списания:
                      </label>
                      <input
                        type="text"
                        required
                        value={fromAccount}
                        onChange={(e) => setFromAccount(e.target.value)}
                        className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-zinc-400 mb-1">
                        Счёт назначения:
                      </label>
                      <input
                        type="text"
                        required
                        value={toAccount}
                        onChange={(e) => setToAccount(e.target.value)}
                        className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                      />
                    </div>
                  </>
                )}

                {txAction === 'retire' && (
                  <>
                    <div>
                      <label className="block text-xs text-zinc-400 mb-1">
                        Счёт списания:
                      </label>
                      <input
                        type="text"
                        required
                        value={fromAccount}
                        onChange={(e) => setFromAccount(e.target.value)}
                        className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-zinc-400 mb-1">
                        Бенефициар погашения:
                      </label>
                      <input
                        type="text"
                        required
                        value={beneficiary}
                        onChange={(e) => setBeneficiary(e.target.value)}
                        className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs text-zinc-400 mb-1">
                        Обоснование погашения (ESG отчетность):
                      </label>
                      <input
                        type="text"
                        required
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                      />
                    </div>
                  </>
                )}
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={submitting || units <= 0}
                  className="rounded-xl bg-emerald-500 px-5 py-2 text-xs font-bold text-zinc-950 transition hover:bg-emerald-400 disabled:opacity-50 shadow-md shadow-emerald-500/20"
                >
                  {submitting ? 'Выполнение...' : 'Подтвердить операцию'}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between border-t border-zinc-800 bg-zinc-950 px-6 py-3 text-xs text-zinc-400">
          <div>Kosmo·MRV Token Registry Engine v1.0</div>
          <button
            onClick={onClose}
            className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800 transition"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
};
