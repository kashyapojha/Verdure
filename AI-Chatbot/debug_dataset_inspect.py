import pandas as pd
from pathlib import Path
path = Path('final_data.csv')
data = pd.read_csv(path)
print('columns=', data.columns.tolist())
print('rows=', len(data))
print('unique ids=', data['id'].nunique())
vc = data['id'].value_counts().sort_values()
print(vc.head(20).to_string())
print('min count=', vc.min())
print('counts distribution sizes=')
print(vc.value_counts().sort_index().to_string())
