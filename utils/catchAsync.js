// const catchAsync = (fn) => {
//   return (req, res, next) => {
//     fn(req, res, next).catch((err) => next(err));
//   };
// };

const catchAsync = (func) => (req, res, next) => {
  Promise.resolve(func(req, res, next)).catch(next);
};

module.exports = catchAsync;
