import numpy as np
import pandas as pd
from sklearn.metrics.pairwise import cosine_similarity
import joblib 
import requests

def create_embedding(text_list):
    r = requests.post("http://localhost:11434/api/embed", json={
        "model": "bge-m3",
        "input": text_list
    })

    embedding = r.json()
    
    if 'embeddings' in embedding:
        return embedding['embeddings']
    else:
        return []

def inference(prompt, model):
    r = requests.post("http://localhost:11434/api/generate", json={
        "model": "deepseek-r1",
        #"model": "llama3.2",
        "prompt": prompt,
        "stream": False
    })

    response = r.json()
    print(response)
    return response
    
df = joblib.load('embeddings.joblib')


df = df[df['embedding'].apply(lambda x: x is not None and len(x) > 0)]
df = df.reset_index(drop=True)

incoming_querry = input("Enter your query: ") 
question_embeding = create_embedding([incoming_querry])


if not question_embeding:
    print("Error: Could not generate embedding for your query. Is Ollama running?")
    exit()

question_embeding = question_embeding[0]

similarities = cosine_similarity(np.vstack(df['embedding']), [question_embeding]).flatten()

top_results = 5
max_indx = similarities.argsort()[::-1][0:top_results]

new_df = df.loc[max_indx]

prompt = f'''I am teaching a course on Python programming. Here are the video subtitle chunks containing video title, video number, 
start time in seconds, end time in seconds, the text at that time :

{new_df[['title','number', 'start', 'end', 'text']].to_json(orient='records')}

--------------------------------------------------------------------------------------------------------
""{incoming_querry}"
User asked this question related to the video chunks, you have to answer in a human way (don't mention above format, its just for you) where and how much content is taught in which video
(in which video and what timestamp) 
and guide the user to the perticular video. if user asks unrelated questions, tell him that you can only answer questions related to the course.
Always convert start and end times from seconds to minutes and seconds format (e.g. 533.8 seconds = 8 minutes 53 seconds). Display timestamps as MM:SS.
'''


with open('prompt.txt', 'w') as f:
    f.write(prompt)

response = inference(prompt, model="deepseek-r1")["response"]
print(response)

with open('response.txt', 'w') as f:
    f.write(response)
