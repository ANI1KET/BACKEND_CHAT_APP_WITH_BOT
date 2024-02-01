// const { NlpManager } = require('node-nlp');

// const trainNLP = async () => {
//     const manager = new NlpManager({ languages: ['en'] });

//     manager.addDocument('en', 'Who is Your Developer?', 'greetings.developer');
//     manager.addDocument('en', 'What is the Developer Name?', 'greetings.developer');
//     manager.addDocument('en', 'Who is Developer?', 'greetings.developer');
//     manager.addDocument('en', 'Who Developed You?', 'greetings.developer');
//     // manager.addDocument('en', '', 'greetings.developer');

//     manager.addAnswer('en', 'greetings.developer', 'His name is Aniket Rouniyar.');
//     manager.addAnswer('en', 'greetings.developer', 'He is Aniket Rouniyar.');

//     await manager.train()
//         .then(() => {
//             manager.save();
//         })
//         .catch((err) => {
//             console.error(err);
//         });
// }

// module.exports = trainNLP;


const { NlpManager } = require('node-nlp');

const trainNLP = async () => {
    const manager = new NlpManager({ languages: ['en'] });

    // Add training data with context
    // manager.addDocument('en', 'Who is Your Developer?', 'greetings.developer');
    // manager.addDocument('en', 'What is the Developer Name?', 'greetings.developer');
    // manager.addDocument('en', 'Who is Developer?', 'greetings.developer');
    // manager.addDocument('en', 'Who Developed You?', 'greetings.developer');

    // Define responses based on context
    // manager.addAnswer('en', 'greetings.developer', 'His name is Aniket Rouniyar');
    // manager.addAnswer('en', 'greetings.developer', 'He is Aniket Rouniyar');

    // Train the NLP model
    await manager.train();

    // Save the trained model
    await manager.save();
};

const processRequest = async (request) => {
    const manager = new NlpManager({ languages: ['en'] });

    manager.load();

    const response = await manager.process('en', request);
    return response.answer;
};

module.exports = { trainNLP, processRequest };

// (async () => {
//     try {
//         // await trainNLP();

//         const request1 = 'Who is Aniket?';
//         const response1 = await processRequest(request1);
//         console.log(response1);

//         const request2 = 'Who is shubham?';
//         const response2 = await processRequest(request2, { aniket: true });
//         console.log(response2);

//     } catch (err) {
//         console.log("err ", err);
//     }
// })();
