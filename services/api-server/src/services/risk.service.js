function calculateMarginLevel({ equity, margin }) {
  const normalizedEquity = Number(equity);
  const normalizedMargin = Number(margin);

  if (
    !Number.isFinite(normalizedEquity) ||
    !Number.isFinite(normalizedMargin)
  ) {
    throw new Error("Invalid equity or margin values.");
  }

  if (normalizedMargin <= 0) {
    return null;
  }

  return (normalizedEquity / normalizedMargin) * 100;
}

function getMarginCallLevel() {
  const level = Number(process.env.MARGIN_CALL_LEVEL || 100);

  if (!Number.isFinite(level) || level <= 0) {
    throw new Error("Invalid MARGIN_CALL_LEVEL configuration.");
  }

  return level;
}

function getStopOutLevel() {
  const level = Number(process.env.STOP_OUT_LEVEL || 50);

  if (!Number.isFinite(level) || level <= 0) {
    throw new Error("Invalid STOP_OUT_LEVEL configuration.");
  }

  return level;
}

function evaluateMarginCall({ equity, margin }) {
  const marginLevel = calculateMarginLevel({
    equity,
    margin,
  });

  const marginCallLevel = getMarginCallLevel();
  const stopOutLevel = getStopOutLevel();

  if (marginLevel === null) {
    return {
      marginLevel: null,
      marginCallLevel,
      stopOutLevel,
      marginCall: false,
      stopOut: false,
      status: "normal",
    };
  }

  const marginCall = marginLevel <= marginCallLevel;
  const stopOut = marginLevel <= stopOutLevel;

  let status = "normal";

  if (stopOut) {
    status = "stop_out";
  } else if (marginCall) {
    status = "margin_call";
  }

  return {
    marginLevel,
    marginCallLevel,
    stopOutLevel,
    marginCall,
    stopOut,
    status,
  };
}

module.exports = {
  calculateMarginLevel,
  getMarginCallLevel,
  getStopOutLevel,
  evaluateMarginCall,
};