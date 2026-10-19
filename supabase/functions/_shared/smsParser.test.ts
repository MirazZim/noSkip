import { describe, it, expect } from "vitest";
import { parseSms } from "./smsParser";

// Samples follow the public bKash / Nagad / BD-bank SMS formats. Replace or add
// real (anonymized) messages here whenever a format changes.

describe("parseSms — bKash", () => {
  it("parses a merchant payment", () => {
    const p = parseSms(
      "Payment Tk 120.00 to FOODPANDA LIMITED-01712345678 successful. Fee Tk 0.00. Balance Tk 2,340.50. TrxID BJK4A1B2C3 at 12/10/2026 14:14",
    );
    expect(p.isTransaction).toBe(true);
    expect(p.provider).toBe("bkash");
    expect(p.kind).toBe("payment");
    expect(p.direction).toBe("debit");
    expect(p.amount).toBe(120);
    expect(p.fee).toBe(0);
    expect(p.balance).toBe(2340.5);
    expect(p.trxId).toBe("BJK4A1B2C3");
    expect(p.merchant).toBe("FOODPANDA LIMITED");
    expect(p.merchantKey).toBe("foodpanda");
    expect(p.isPerson).toBe(false);
    expect(p.txnAt?.toISOString()).toBe("2026-10-12T08:14:00.000Z");
    expect(p.txnHasTime).toBe(true);
  });

  it("tags Send Money to a phone number as a person", () => {
    const p = parseSms(
      "Send Money Tk 500.00 to 01712345678 successful. Ref rent. Fee Tk 0.00. Balance Tk 1,840.50. TrxID BJK5D4E5F6 at 12/10/2026 14:20",
    );
    expect(p.kind).toBe("send_money");
    expect(p.direction).toBe("debit");
    expect(p.amount).toBe(500);
    expect(p.isPerson).toBe(true);
    expect(p.merchantKey).toBe("01712345678");
  });

  it("captures the cash-out fee separately", () => {
    const p = parseSms(
      "Cash Out Tk 1,000.00 to 01812345678 successful. Fee Tk 18.50. Balance Tk 822.00. TrxID BJK6G7H8I9 at 12/10/2026 18:02",
    );
    expect(p.kind).toBe("cash_out");
    expect(p.amount).toBe(1000);
    expect(p.fee).toBe(18.5);
    expect(p.balance).toBe(822);
  });

  it("parses received money as a credit", () => {
    const p = parseSms(
      "You have received Tk 2,500.00 from 01912345678. Ref lunch. Fee Tk 0.00. Balance Tk 3,322.00. TrxID BJK7J1K2L3 at 13/10/2026 10:05",
    );
    expect(p.direction).toBe("credit");
    expect(p.kind).toBe("received");
    expect(p.amount).toBe(2500);
    expect(p.merchantKey).toBe("01912345678");
    expect(p.isPerson).toBe(true);
  });

  it("parses a mobile recharge", () => {
    const p = parseSms(
      "Recharge Tk 50.00 to 01712345678 is successful. Balance Tk 772.00. TrxID BJK8M4N5O6 at 13/10/2026 11:00",
    );
    expect(p.kind).toBe("recharge");
    expect(p.direction).toBe("debit");
    expect(p.amount).toBe(50);
  });
});

describe("parseSms — Nagad", () => {
  it("parses a multi-line payment", () => {
    const p = parseSms(
      "Payment to 'PATHAO LTD' is Successful.\nAmount: Tk 230.00\nTxnID: 7ABCD1234\nBalance: Tk 1,150.25\n12/10/2026 21:40",
      "NAGAD",
    );
    expect(p.provider).toBe("nagad");
    expect(p.kind).toBe("payment");
    expect(p.amount).toBe(230);
    expect(p.balance).toBe(1150.25);
    expect(p.trxId).toBe("7ABCD1234");
    expect(p.merchant).toBe("PATHAO LTD");
    expect(p.merchantKey).toBe("pathao");
  });

  it("parses money received with a Sender label", () => {
    const p = parseSms(
      "Money Received.\nAmount: Tk 500.00\nSender: 01712345678\nRef: N/A\nTxnID: 7EFGH5678\nBalance: Tk 1,650.25\n12/10/2026 22:00",
    );
    expect(p.direction).toBe("credit");
    expect(p.isPerson).toBe(true);
    expect(p.merchantKey).toBe("01712345678");
  });
});

describe("parseSms — cards", () => {
  it("parses a BDT card purchase with no TrxID", () => {
    const p = parseSms(
      "Your VISA Card ending 1234 has been used for BDT 1,200.00 at SHWAPNO GULSHAN 2 on 12-Oct-26 14:14. Available limit BDT 48,800.00",
    );
    expect(p.isTransaction).toBe(true);
    expect(p.provider).toBe("card");
    expect(p.kind).toBe("card");
    expect(p.direction).toBe("debit");
    expect(p.amount).toBe(1200);
    expect(p.balance).toBe(48800);
    expect(p.trxId).toBeNull();
    expect(p.merchant).toBe("SHWAPNO GULSHAN 2");
    expect(p.merchantKey).toBe("shwapno gulshan");
    expect(p.txnAt?.toISOString()).toBe("2026-10-12T08:14:00.000Z");
  });

  it("keeps the currency of a foreign charge", () => {
    const p = parseSms(
      "Dear Cardmember, a transaction of USD 15.49 has been made at NETFLIX.COM on 12/10/2026 using card **5678.",
    );
    expect(p.currency).toBe("USD");
    expect(p.amount).toBe(15.49);
    expect(p.merchantKey).toBe("netflix");
  });

  it("parses an amount written after the currency figure", () => {
    const p = parseSms("1,250.00 BDT debited from card xx4321 at DARAZ BANGLADESH LTD on 11-Oct-2026");
    expect(p.amount).toBe(1250);
    expect(p.direction).toBe("debit");
    expect(p.merchantKey).toBe("daraz");
  });
});

describe("parseSms — real messages (anonymized)", () => {
  it("bKash money received", () => {
    const p = parseSms(
      "You have received Tk 2,928.19 from 01700000000. Fee Tk 0.00. Balance Tk 2,975.65. TrxID DJ87KXK3HJ at 08/10/2026 10:24",
    );
    expect(p.isTransaction).toBe(true);
    expect(p.provider).toBe("bkash");
    expect(p.direction).toBe("credit");
    expect(p.amount).toBe(2928.19);
    expect(p.fee).toBe(0);
    expect(p.balance).toBe(2975.65);
    expect(p.trxId).toBe("DJ87KXK3HJ");
    expect(p.isPerson).toBe(true);
    expect(p.merchantKey).toBe("01700000000");
    expect(p.txnAt?.toISOString()).toBe("2026-10-08T04:24:00.000Z");
  });

  it("bKash merchant payment", () => {
    const p = parseSms(
      "Payment Tk 1,250.00 to Aarong successful. Ref 1. Fee Tk 0.00. Balance Tk 3,420.50. TrxID BKW8N2M4P1 at 12/10/2026 11:35.",
    );
    expect(p.isTransaction).toBe(true);
    expect(p.provider).toBe("bkash");
    expect(p.kind).toBe("payment");
    expect(p.direction).toBe("debit");
    expect(p.amount).toBe(1250);
    expect(p.fee).toBe(0);
    expect(p.balance).toBe(3420.5);
    expect(p.trxId).toBe("BKW8N2M4P1");
    expect(p.merchant).toBe("Aarong");
    expect(p.merchantKey).toBe("aarong");
    expect(p.isPerson).toBe(false);
    expect(p.txnAt?.toISOString()).toBe("2026-10-12T05:35:00.000Z");
  });

  it("City Bank CITYTOUCH withdrawal (label after the figure, no merchant)", () => {
    const p = parseSms(
      "10-Oct-2026\nCITYTOUCH TXN\nTk. 800 Withdrawal\nTk. 33,204 Balance\nA/C: 2304***0000\nPlease rate us: https://s.cbl.fyi/s/R62AtuZ",
    );
    expect(p.isTransaction).toBe(true);
    expect(p.provider).toBe("city_bank");
    expect(p.direction).toBe("debit");
    expect(p.amount).toBe(800);
    expect(p.balance).toBe(33204);
    expect(p.merchant).toBeNull();
    expect(p.txnAt?.toISOString()).toBe("2026-10-10T06:00:00.000Z");
  });

  it.each([
    ["with the rate-us link", "\nPlease rate us: https://s.cbl.fyi/s/R62AtuZ"],
    ["with the link cut off", "\nPlease rate us:"],
  ])("City Bank E-COMM/POS purchase (%s)", (_label, tail) => {
    const p = parseSms(
      "16-Oct-2026\nE-COMM/POS TXN\nTk. 210 Purchased\nTk. 6,767 Balance\nA/C: 2304***0000" + tail,
    );
    expect(p.isTransaction).toBe(true);
    expect(p.provider).toBe("city_bank");
    expect(p.kind).toBe("payment");
    expect(p.direction).toBe("debit");
    expect(p.amount).toBe(210);
    expect(p.balance).toBe(6767);
    expect(p.merchant).toBeNull();
    expect(p.trxId).toBeNull();
    expect(p.txnAt?.toISOString()).toBe("2026-10-16T06:00:00.000Z");
    expect(p.txnHasTime).toBe(false);
  });

  it("City Bank ATM withdrawal is a cash-out", () => {
    const p = parseSms(
      "14-Sep-2026\nATM TXN\nTk. 500 Withdrawal\nTk. 27,646 Balance\nA/C: 23040000\nPlease rate us: https://s.cbl.fyi/s/CUdLX7l",
    );
    expect(p.isTransaction).toBe(true);
    expect(p.provider).toBe("city_bank");
    expect(p.kind).toBe("cash_out");
    expect(p.direction).toBe("debit");
    expect(p.amount).toBe(500);
    expect(p.balance).toBe(27646);
    expect(p.txnAt?.toISOString()).toBe("2026-09-14T06:00:00.000Z");
  });

  it("City Bank deposit (no header, no link) is a credit", () => {
    const p = parseSms("08-Oct-2026\nTk. 34,933 Deposit\nTk. 34,985 Balance\nA/C: 23040000");
    expect(p.isTransaction).toBe(true);
    expect(p.provider).toBe("city_bank");
    expect(p.kind).toBe("received");
    expect(p.direction).toBe("credit");
    expect(p.amount).toBe(34933);
    expect(p.balance).toBe(34985);
    expect(p.merchant).toBeNull();
    expect(p.txnAt?.toISOString()).toBe("2026-10-08T06:00:00.000Z");
  });
});

describe("parseSms — things to drop", () => {
  it("drops OTPs", () => {
    const p = parseSms("Your bKash verification code is 123456. Do not share it with anyone. Tk 0");
    expect(p.isTransaction).toBe(false);
    expect(p.skipReason).toBe("otp");
  });

  it("drops promos without a TrxID", () => {
    const p = parseSms("Enjoy 20% cashback up to Tk 100 on bKash payment at Foodpanda! Offer valid till 31 Oct. T&C apply.");
    expect(p.isTransaction).toBe(false);
    expect(p.skipReason).toBe("promo");
  });

  it("drops messages with no amount", () => {
    expect(parseSms("Your bKash account PIN was changed.").isTransaction).toBe(false);
  });
});
